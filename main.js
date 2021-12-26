import "./style.css";

// Import the functions you need from the SDKs you need
import firebase from "firebase/app";
import "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
	apiKey: "AIzaSyB1jcn_hNYra0_qPEXh8QIRupTmsUb5YiU",
	authDomain: "webrtc-demo-d18bf.firebaseapp.com",
	projectId: "webrtc-demo-d18bf",
	storageBucket: "webrtc-demo-d18bf.appspot.com",
	messagingSenderId: "483331452176",
	appId: "1:483331452176:web:fe6b55f22844e7665f0995",
};

// Initialize Firebase & Firestore
if (!firebase.apps.length) {
	firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();

const servers = {
	iceServers: [
		{
			urls: ["stun:stun1.1.google.com:19302", "stun:stun2.1.google.com:19302"],
		},
	],
	iceCandidatePoolSize: 10,
};

// Global State
let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");

// 1. Setup media sources
webcamButton.onclick = async () => {
	localStream = await navigator.mediaDevices.getUserMedia({
		video: true,
		audio: true,
	});
	remoteStream = new MediaStream();

	// push tracks from local stream to peer RTCPeerConnection
	localStream.getTracks().forEach((track) => {
		pc.addTrack(track, localStream);
	});

	// pull tracks from remote stream and add to video stream
	pc.ontrack = (event) => {
		event.streams[0].getTracks().forEach((track) => {
			remoteStream.addTrack(track);
		});
	};

	webcamVideo.srcObject = localStream;
	remoteVideo.srcObject = remoteStream;

	callButton.disabled = false;
	answerButton.disabled = false;
	webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
	const callDoc = firestore.collection("calls").doc();
	const offerCandidates = callDoc.collection("offerCandidates");
	const answerCandidates = callDoc.collection("answerCandidates");

	callInput.value = callDoc.id;

	//get candidates for caller, save to db
	pc.onicecandidate = (event) => {
		event.candidate && offerCandidates.add(event.candidate.toJSON());
	};

	//create offer
	const offerDescription = await pc.createOffer();
	await pc.setLocalDescription(offerDescription);

	const offer = {
		sdp: offerDescription.sdp,
		type: offerDescription.type,
	};

	await callDoc.set({ offer });

	//listen for remote answer
	callDoc.onSnapshot((snapshot) => {
		const data = snapshot.data();
		if (!pc.currentRemoteDescription && data?.answer) {
			const answerDescription = new RTCSessionDescription(data.answer);
			pc.setRemoteDescription(answerDescription);
		}
	});

	//when answered, add candidate to peer connection
	answerCandidates.onSnapshot((snapshot) => {
		snapshot.docChanges().forEach((change) => {
			if (change.type === "added") {
				const candidate = new RTCIceCandidate(change.doc.data());
				pc.addIceCandidate(candidate);
			}
		});
	});

	hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
	const callId = callInput.value;
	const callDoc = firestore.collection("calls").doc(callId);
	const answerCandidates = callDoc.collection("answerCandidates");
	const offerCandidates = callDoc.collection("offerCandidates");

	pc.onicecandidate = (event) => {
		event.candidate && answerCandidates.add(event.candidate.toJSON());
	};

	const callData = (await callDoc.get()).data();

	const offerDescription = callData.offer;
	await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

	const answerDescription = await pc.createAnswer();
	await pc.setLocalDescription(answerDescription);

	const answer = {
		sdp: answerDescription.sdp,
		type: answerDescription.type,
	};

	await callDoc.update({ answer });

	offerCandidates.onSnapshot((snapshot) => {
		snapshot.docChanges().forEach((change) => {
			if (change.type === "added") {
				let data = change.doc.data();
				pc.addIceCandidate(new RTCIceCandidate(data));
			}
		});
	});
};
