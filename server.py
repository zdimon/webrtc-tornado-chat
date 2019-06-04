#!/usr/bin/env python
import tornado.ioloop
import tornado.web
# шаблонизатор
loader = tornado.template.Loader(".")
# утилита перегрузки сервера при изменениях кода
from tornado import autoreload
# обработчик вебсокетов
from tornado.websocket import WebSocketHandler
import json
import datetime
import time
import hashlib
import tornadoredis

# Создаем клиента Redis в глобальной переменной
# для посылки сообщений напрямую в канал

import redis
redis_client = redis.Redis(host='localhost', port=6379, db=0)

# отдает главную страницу
class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.render("index.html")

# глобальный словарь для хранения текущих соединений
ws_clients = {} 

def send_cliens_to_all():
    clnts = []
    # сформируем список соединений
    for key, value in ws_clients.items():
        clnts.append({
            'id': key,
            'username': value['username']
        })
    # отправим список в каждое соединение
    for key, value in ws_clients.items():
        ws_clients[key]['connection'].write_message(\
            {\
                'action': 'update_clients',\
                'message': json.dumps(clnts)\
            }\
        )

       

class WebsocketHandler(tornado.websocket.WebSocketHandler):
        

    # сама подписка на канал (асинхронно)
    @tornado.gen.coroutine
    def listen_redis(self,channel_id):
        self.client = tornadoredis.Client()
        self.client.connect()
        yield tornado.gen.Task(self.client.subscribe, self.client_id)
        self.client.listen(self.redis_message)

    # обработчик поступления сообщений из редиса
    def redis_message(self,message):
        if(message.kind != 'subscribe'):
            data = message.body
            self.write_message(data)

    # обработчик открытия соединения
    def open(self):
        print('Open connection')
        # генерируем уникальный идентификатор клиента из таймстампа
        sign = hashlib.md5(str(datetime.datetime.now()).encode('utf-8')).hexdigest()
        self.client_id = sign
        # добавление соединения в глобальный словарь
        ws_clients[sign] = {}
        ws_clients[sign]['connection'] = self
        ws_clients[sign]['username'] = 'undefined'
        self.listen_redis(self.client_id)

       
    # обработчик поступления сообщения из клиента по вебсокету
    def on_message(self, message):
        message = json.loads(message)
        print('got message "%s"' % message['action'])
        if message['action'] == 'login':
            print('Login with name %s' % message['message'])
            ws_clients[self.client_id]['username'] = message['message']
            # отправляем клиенту его идентификатор соединения на сервере
            self.write_message(\
                {\
                    'action': 'set_connection_id',\
                    'message': self.client_id\
                }\
            )
            
            send_cliens_to_all()


        if message['action'] == 'offer':
            print("Sending offer to: %s" % message['destination'])
            message['initiator_id'] = self.client_id
            redis_client.publish(\
                message['destination'],\
                json.dumps(message)\
                )
            
        if message['action'] == 'answer':
            print("Sending answer to: %s" % message['destination'])
            redis_client.publish(\
                message['destination'],\
                json.dumps(message)\
                )

        if message['action'] == 'candidate':
            print("Sending ICE candidate to: %s" % message['destination'])
            redis_client.publish(\
                message['destination'],\
                json.dumps(message)\
                )

        if message['action'] == 'leave':
            print("Leaving chat")


    # обработчик закрытия соединения клиентом
    def on_close(self):
        print('close connection') 
        # удаление соединения из глобального словаря   
        del ws_clients[self.client_id]
        send_cliens_to_all()

# конфигурируем приложение роутингом
def make_app():
    return tornado.web.Application([
        # главная страница
        (r"/", MainHandler),
        # отдача статики
        (r'/static/(.*)', tornado.web.StaticFileHandler, {'path': 'static'}),
        # запросы по веб-сокету
        (r"/websocket", WebsocketHandler),
    ])

if __name__ == "__main__":
    print('Starting server on 8888 port')
    autoreload.start()
    autoreload.watch('.')
    autoreload.watch('index.html')
    app = make_app()
    app.listen(8888)
    tornado.ioloop.IOLoop.current().start()