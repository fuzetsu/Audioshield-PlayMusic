// Audioshield-PlayMusic
// Fork of Audioshield-Tubifier by https://www.reddit.com/user/-olli-

// Load the credentails
const API_KEY = require('./apikey.json');

// Load a template for an empty response from Soundcloud API. This will be filled with values from the Play Music API.
const soundcloudTemplate = require('./soundcloud_template.json');

// Required libraries
const fs = require('fs');
const PlayMusic = require('playmusic');
const ffmpeg = require('fluent-ffmpeg');
const https = require('https');
const express = require('express');

var app = express();
var pm = new PlayMusic();

// Setting a dummy HTTPS certificate
var options = {
	key: fs.readFileSync('./key.pem'),
	cert: fs.readFileSync('./cert.pem'),
	passphrase: "audioshield"
};

var parseTracks = function(tracks) {
	var output = tracks.map((track) => {
		var soundcloudResponse = JSON.parse(JSON.stringify(soundcloudTemplate));
		// Fill the template with values from the Play Music API response
		// Note specially the stream_url -field, which is set to correspond to our /stream HTTPS endpoint
		soundcloudResponse.title = track.track.title;
		soundcloudResponse.id = track.track.nid;
		soundcloudResponse.artwork_url = track.track.albumArtRef[0].url;
		soundcloudResponse.user.username = track.track.artist;
		soundcloudResponse.stream_url = `https://api.soundcloud.com/stream?id=${soundcloudResponse.id}`;
		soundcloudResponse.uri = `https://api.soundcloud.com/stream/${soundcloudResponse.id}`;
		soundcloudResponse.permalink = soundcloudResponse.id;
		soundcloudResponse.permalink_url = soundcloudResponse.uri;

		return soundcloudResponse;
	});

	// Return the constructed output in JSON-format
	return JSON.stringify(output);
};

// Here we register a HTTPS endpoint that streams a given Play Music ID as an mp3-file
// Expected URL: https://api.soundcloud.com/stream?id=<ID>
app.get('/stream', (req, res) => {
	// Are we missing the id -parameter or is it empty?
	if ((typeof req.query.id === 'undefined') || (req.query.id.length === 0)) {
		res.writeHead(500);
		res.end("parameter 'id' missing or empty");
	} else {
		// id -parameter found
		// Audioshield appends any stream url it gets with another query variable, so we have to split it, and only use the first part
		var id = req.query.id.split("?")[0];
	
		console.log(`Got a stream request for Play Music id: ${id}`);

		pm.init({androidId: API_KEY.androidId, masterToken: API_KEY.masterToken}, (err) => {
			if (err) throw err;

			// load audio
			pm.getStreamUrl(id, (err, url) => {
				if (err) throw err;

				// Set the HTTP-headers to audio/mpeg
				res.setHeader('Content-Type', 'audio/mpeg');
				res.writeHead(200);

				// Initialize ffmpeg, which is used for the mp3-conversion
				proc = new ffmpeg({source: url});
				
				// Error handling
				proc.on('error', (err, stdout, stderr) => { 
					// "Output stream closed" error message is ignored, it is caused by browsers doing a double HTTP-request
					if (err.message != "Output stream closed") throw err;
				});
				
				// Set audio format and begin streaming
				proc.toFormat('mp3');
				proc.audioBitrate(320);
				proc.writeToStream(res, { end: true });
			});
		});
	}
});

// Here we register a HTTPS endpoint that handles searching Play Music for tracks
// This endpoint format is set by Audioshield, so we have to follow it
// Expected URL: https://api.soundcloud.com/tracks?q=<SearchTerms>
app.get('/tracks', (req, res) => {
	// Are we missing the q -parameter or is it empty?	
	if ((typeof req.query.q === 'undefined') || (req.query.q.length === 0)) {
		res.writeHead(500);
		res.end("parameter 'q' missing or empty");
	} else {
		// q -parameter found
		console.log(`Got a search request: ${req.query.q}`);

		pm.init({androidId: API_KEY.androidId, masterToken: API_KEY.masterToken}, (err) => {
			if (err) throw err;

			pm.search(req.query.q, 20, (err, data) => {
				if (err) console.error(err);
				else {
					// only return songs
					var tracks = data.entries.filter((entry) => {
						return entry.type === '1';
					}).sort((a, b) => {
						return a.score < b.score;
					});

					var content = parseTracks(tracks);

					// Write contents to browser
					res.writeHead(200);
					res.end(content);
				}
			});
		});
	}
});

// Script execution begins here
if (API_KEY.androidId !== "-1" && API_KEY.masterToken !== '-1') {
	// Credentials have been set, start the server and listen for incoming connections to our HTTPS endpoints
	// Audioshield expects HTTPS port 443

	var httpsServer = https.createServer(options, app);
	httpsServer.listen(443);

	console.log('Server running');
	console.log('CTRL+C to shutdown');
} else {
	// Credentials key has not been set
	console.log('API keys have not been set. Login using login.js.');
}
