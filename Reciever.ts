import {WebSocket} from 'ws';

const HOST = 'ws://localhost:3000';
console.log(HOST);
const ws = new WebSocket(HOST);

ws.onmessage = function (event) {
	console.log( event.data );
};