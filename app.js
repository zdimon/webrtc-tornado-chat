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

    async function call() {
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
      
      // Создаем объекты RTCPeerConnection c пустой конфигурацией
      const configuration = {};
      console.log('RTCPeerConnection configuration:', configuration);
      pc1 = new RTCPeerConnection(configuration);
      console.log('Created local peer connection object pc1');
      pc2 = new RTCPeerConnection(configuration);
      console.log('Created remote peer connection object pc2');
      
      // Добавляем обработчики на событие добавления ICE кандидата
      pc1.addEventListener('icecandidate', e => onIceCandidate(pc1, e));
      pc2.addEventListener('icecandidate', e => onIceCandidate(pc2, e));
      
      // Обработчик добавления потока на второе соединение
      pc2.addEventListener('track', gotRemoteStream);

      // Достаем потоки из текущего stream объекта и передаем их в объект RTCPeerConnection
      localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));
      console.log(localStream.getTracks());

      // Формируем offer из pc1
      try {
        console.log('pc1 createOffer start');
        const offer = await pc1.createOffer(offerOptions);
        await onCreateOfferSuccess(offer);
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
    
    async function onCreateOfferSuccess(desc) {
      console.log(`Offer from pc1\n${desc.sdp}`);
      console.log('pc1 setLocalDescription start');
      try {
        await pc1.setLocalDescription(desc);
        onSetLocalSuccess(pc1);
      } catch (e) {
        console.log(`error setting description to pc1 ${error.toString()}`);
      }

      console.log('pc2 setRemoteDescription start');
      try {
        await pc2.setRemoteDescription(desc);
        onSetRemoteSuccess(pc2);
      } catch (e) {
        console.log(`error setting description to pc2 ${error.toString()}`);
      }

      console.log('pc2 createAnswer start');
     
      /*
        Так как у нас один видео-поток для двух соединений,
        мы формируем объект SDP offer напямую из второго соединения
      */
      
      try {
        const answer = await pc2.createAnswer();
        await onCreateAnswerSuccess(answer);
      } catch (e) {
        onCreateSessionDescriptionError(e);
      }
    }    
    
    
    // Функция добавление потока к элементу remoteVideo
    
    function gotRemoteStream(e) {
      if (remoteVideo.srcObject !== e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
        console.log('pc2 received remote stream');
      }
    }    

    // Добавление ICE кандидата.
    
    async function onIceCandidate(pc, event) {
      try {
        await (getOtherPc(pc).addIceCandidate(event.candidate));
        onAddIceCandidateSuccess(pc);
      } catch (e) {
        onAddIceCandidateError(pc, e);
      }
      console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
    }


    // Функция формирования ответного SDP offer 
    
    async function onCreateAnswerSuccess(desc) {
      console.log(`Answer from pc2:\n${desc.sdp}`);
      console.log('pc2 setLocalDescription start');
      try {
        await pc2.setLocalDescription(desc);
        onSetLocalSuccess(pc2);
      } catch (e) {
        onSetSessionDescriptionError(e);
      }
      console.log('pc1 setRemoteDescription start');
      try {
        await pc1.setRemoteDescription(desc);
        onSetRemoteSuccess(pc1);
      } catch (e) {
        onSetSessionDescriptionError(e);
      }
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
        
    function onAddIceCandidateError(pc, error) {
      console.log(`${getName(pc)} failed to add ICE Candidate: ${error.toString()}`);
    }

    localVideo.addEventListener('loadedmetadata', function() {
      console.log(`Local video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
    });

    remoteVideo.addEventListener('loadedmetadata', function() {
      console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
    });
    
    
    
