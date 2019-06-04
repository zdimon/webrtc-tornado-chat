    'use strict';

    const startButton = document.getElementById('startButton');
    const callButton = document.getElementById('callButton');
    const hangupButton = document.getElementById('stopButton');
    callButton.disabled = true;
    hangupButton.disabled = true;
    startButton.addEventListener('click', start);
    callButton.addEventListener('click', call);
    hangupButton.addEventListener('click', stop);
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    let localStream;
    let pc1;
    let pc2;
    const offerOptions = {
      offerToReceiveAudio: 1,
      offerToReceiveVideo: 1
    };

    // ws
    var ws = new WebSocket("ws://localhost:8888/websocket");



    const configuration = {};
    // Создаем объекты RTCPeerConnection c пустой конфигурацией
    
    console.log('RTCPeerConnection configuration:', configuration);
    pc1 = new RTCPeerConnection(configuration);
    console.log('Created local peer connection object pc1');
    pc2 = new RTCPeerConnection(configuration);
    console.log('Created remote peer connection object pc2');

    // Добавляем обработчики на событие добавления ICE кандидата
    pc1.addEventListener('icecandidate', e => onIceCandidate1(pc1, e));
    pc2.addEventListener('icecandidate', e => onIceCandidate2(pc2, e));

    // Login
    const loginButton = document.getElementById('loginButton');
    const username = document.getElementById('username');
    const socketId = $('#socketId');
    const abonentId = $('#abonentId');
    const clientList = $('#clientList');
    loginButton.addEventListener('click', login);

    ws.onmessage = function (evt) {
      let jdata = JSON.parse(evt.data);    
      if( jdata['action'] == 'set_connection_id'){
          console.log(`Set sign ${jdata['message']}`);
          socketId.val(jdata['message']);
      } 
      if( jdata['action'] == 'update_clients'){
        console.log(`Updating clients ${jdata['message']}`);
        clientList.empty()
;        let data = JSON.parse(jdata['message']);
        data.forEach(function (item, index) {
          console.log(item);
          clientList.append(`<li><a href="#" id="${item.id}">${item.username}</a></li>`)
          clientList.find(`#${item.id}`).on('click',call);
        });
      }
      if( jdata['action'] == 'offer'){
        console.log('Geting offer');
        console.log(jdata);
        // Обработчик добавления потока на второе соединение
        pc2.addEventListener('track', gotRemoteStream);
        
        // устанавливаем initiator_id в input для того чтоб знать 
        // его при передаче ICE кандидата
        
        abonentId.val(jdata['initiator_id']);

        pc2.setRemoteDescription(jdata['offer']).then(function(){
          console.log('pc2.setRemoteDescription');
          pc2.createAnswer().then(function(answer){
            onCreateAnswerSuccess(answer,jdata['initiator_id']);
          },onCreateSessionDescriptionError);
        },onSetSessionDescriptionError);
        

        
      }

      if( jdata['action'] == 'answer'){
        console.log('Geting answer');
        console.log(jdata);
        //pc2.setLocalDescription(jdata['offer']).then(onSetLocalSuccess,onSetSessionDescriptionError);
        pc1.setRemoteDescription(jdata['offer']).then(onSetRemoteSuccess,onSetSessionDescriptionError)
      }

      if( jdata['action'] == 'candidate'){
        console.log('ICE candidate');
        if (jdata['candidate'] != null){
          let candidate = new RTCIceCandidate(jdata['candidate']);
          console.log(candidate);
          if(jdata['pc'] == 'pc1'){
            console.log(`Addinng ICE to pc1 ${jdata['destination']} ${socketId.val()}`);
            pc1.addIceCandidate(candidate).then(onAddIceCandidateSuccess,onAddIceCandidateError);
          } else {
            console.log('Addinng ICE to pc2');
            pc2.addIceCandidate(candidate).then(onAddIceCandidateSuccess,onAddIceCandidateError);
          }
          
        }
      }
     


    }

    function login(){
      console.log('Logining');
      let message = {'action': 'login', 'message': username.value}
      ws.send(JSON.stringify(message));      
    }

    async function start() {
        console.log('Start')
        console.log('Requesting local stream');
        startButton.disabled = true;
      try {
          const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
          console.log('Received local stream');
          localVideo.srcObject = stream;
          localStream = stream;
          callButton.disabled = false;
      } catch (e) {
          alert(`getUserMedia() error: ${e.name}`);
      }

    };

    async function call(evt) {
      // заберем идентификатор абонента
      let con_id = $(evt.target).attr('id');
      // устанавливаем его в input для того чтоб знать 
      // destination при передаче ICE кандидата
      abonentId.val(con_id);
      console.log(con_id);
      // Установим состояние кнопок
      callButton.disabled = true;
      hangupButton.disabled = false;
      console.log('Starting call');
      // Получаем и выводим информацию о медиа-потоках
      const videoTracks = localStream.getVideoTracks();
      const audioTracks = localStream.getAudioTracks();
      if (videoTracks.length > 0) {
        console.log(`Using video device: ${videoTracks[0].label}`);
      }
      if (audioTracks.length > 0) {
        console.log(`Using audio device: ${audioTracks[0].label}`);
      }
      

      // Достаем потоки из текущего stream объекта и передаем их в объект RTCPeerConnection
      localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));
      console.log(localStream.getTracks());

      // Формируем offer из pc1
      try {
        console.log('pc1 createOffer start');
        const offer = await pc1.createOffer(offerOptions);
        await onCreateOfferSuccess(offer,con_id);
      } catch (e) {
         console.log(`${e}`);
      }
    }

    async function stop() {
        console.log('Stop')
    };




    function getName(pc) {
      return (pc === pc1) ? 'pc1' : 'pc2';
    }

    function getOtherPc(pc) {
      return (pc === pc1) ? pc2 : pc1;
    }
    
    // Функция формирования offer
    
    async function onCreateOfferSuccess(desc, conn_id) {
      console.log(`Offer from pc1\n${desc.sdp}`);
      console.log('pc1 setLocalDescription start');
      // отправляем запрос offer на сервер
      let message = {'action': 'offer', 'offer': desc, 'destination': conn_id}
      ws.send(JSON.stringify(message));
      try {
        await pc1.setLocalDescription(desc);
        onSetLocalSuccess(pc1);
      } catch (e) {
        console.log(`error setting description to pc1 ${error.toString()}`);
      }

      /*
      console.log('pc2 setRemoteDescription start');
      try {
        await pc2.setRemoteDescription(desc);
        onSetRemoteSuccess(pc2);
      } catch (e) {
        console.log(`error setting description to pc2 ${error.toString()}`);
      }

      console.log('Send offer to server');
      */
          
     
      /*
        Так как у нас один видео-поток для двух соединений,
        мы формируем объект SDP offer напямую из второго соединения
      
      

      */
    }    
    
    
    // Функция добавление потока к элементу remoteVideo
    
    function gotRemoteStream(e) {
      if (remoteVideo.srcObject !== e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
        console.log('pc2 received remote stream');
      }
    }    

    // Добавление ICE кандидата.

    function onIceCandidate1(pc, event) {
        // отправляем запрос candidate на сервер
        console.log('11111111111111111111111');
        let message = {'action': 'candidate', 'pc': 'pc2', 'candidate': event.candidate, 'destination': abonentId.val()}
        ws.send(JSON.stringify(message)); 
    }

    function onIceCandidate2(pc, event) {
      // отправляем запрос candidate на сервер
      console.log('22222222222222222222222222');
      let message = {'action': 'candidate', 'pc': 'pc1', 'candidate': event.candidate, 'destination': abonentId.val()}
      ws.send(JSON.stringify(message)); 
    }    

    async function onIceCandidate(pc, event) {

      // отправляем запрос candidate на сервер
      
        let message = {'action': 'candidate', 'candidate': event.candidate, 'destination': socketId.val()}
        ws.send(JSON.stringify(message));         
     
      /*
      try {
        await (getOtherPc(pc).addIceCandidate(event.candidate));
        onAddIceCandidateSuccess(pc);
      } catch (e) {
        onAddIceCandidateError(pc, e);
      }
      */
      //console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
    }


    // Функция формирования ответного SDP offer 
    
    async function onCreateAnswerSuccess(desc,initiator_id) {
      //console.log(`Answer from pc2:\n${desc.sdp}`);
      console.log(`Answer from pc2`);
      // посылаем ответ answer на сервер
      let message = {'action': 'answer', 'offer': desc, 'destination': initiator_id}
      ws.send(JSON.stringify(message));  
   

      
      try {
        await pc2.setLocalDescription(desc);
        onSetLocalSuccess(pc2);
      } catch (e) {
        onSetSessionDescriptionError(e);
      }
      /*
      console.log('pc1 setRemoteDescription start');
      try {
        await pc1.setRemoteDescription(desc);
        onSetRemoteSuccess(pc1);
      } catch (e) {
        onSetSessionDescriptionError(e);
      }
      */
    }

    /// Дебаг функции 
    
    function onSetLocalSuccess(pc) {
      console.log(`${getName(pc)} setLocalDescription complete`);
    }    
        
    function onSetRemoteSuccess(pc) {
      console.log(`${getName(pc)} setRemoteDescription complete`);
    }        
        
    function onCreateSessionDescriptionError(error) {
      console.log(`Failed to create session description: ${error.toString()}`);
    }    
    
    function onAddIceCandidateSuccess(pc) {
      console.log(`${getName(pc)} addIceCandidate success`);
    }
        
    function onAddIceCandidateError(error) {
      console.log(` failed to add ICE Candidate: ${error.toString()}`);
    }

    function onSetSessionDescriptionError(error) {
      console.log(`Error setting SESSION description: ${error.toString()}`);
    }

    localVideo.addEventListener('loadedmetadata', function() {
      console.log(`Local video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
    });

    remoteVideo.addEventListener('loadedmetadata', function() {
      console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
    });
    
    
    
