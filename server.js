'use strict';

//Application Dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

//Load enviroment variables from .env file
require('dotenv').config();

// Aplication setup
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

// Database Setup
const client = new pg.Client(process.env.Databse_URL);
client.connect();
client.on('error', err => console.error(err));

//route to location
app.get('/location', (request, response) => {
  searchToLatLong(request.query.data)
    .then(location => response.send(location))
    .catch(error => handleError(error, response));
});

//route to weather
app.get('/weather', getWeather);

// Route to meetup
app.get('/meetups', getMeetUp);


//***************** */
// Helper Functions
//***************** */

//Errror handler
function handleError(err, res){
  if (res) res.status(500).send('Sorry, there was an error');
}

// Location route handler
function searchToLatLong(query){
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GOOGLE_API}`;
  return superagent.get(url)
    .then(res => {
      return new Location(query, res.body.results[0]);
    })
    .catch(error => handleError(error));
}

// Weather route handler
function getWeather(request, response){
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API}/${request.query.data.latitude},${request.query.data.longitude}`;

  superagent.get(url)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        return new Weather(day);
      });
      response.send(weatherSummaries);
    })
    .catch(error => handleError(error, response));
}

//MeetUp route handler
function getMeetUp(request, response){
  const url = `https://api.meetup.com/find/upcoming_events?&sign=true&photo-host=public&lon=${request.query.data.longitude}&page=20&lat=${request.query.data.latitude}&key=${process.env.MEETUP_API}`
  return superagent.get(url)
    .then(result => {
      const meetUpSummaries = result.body.events.map(meetup => {
        const event = new MeetUp(meetup)
        console.log(event);
        return event;
      });
      response.send(meetUpSummaries);
    })
    .catch(error => handleError(error));
}

//**************** */
// Constructors
//**************** */

//location constructor
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.formatted_address;
  this.latitude = res.geometry.location.lat;
  this.longitude = res.geometry.location.lng;
}

//forecast constructor
function Weather(day){
  this.forecast = day.summary;
  this.time = new Date(day.time*1000).toString().slice(0,15);
}

//meetup constructor
function MeetUp(meetup) {
  this.link = meetup.link;
  this.name = meetup.name;
  this.creation_date = new Date(meetup.group.created).toString().slice(0, 15);
  this.host = meetup.group.name;
  this.created_at = Date.now();
}

app.use('*', (err, res) => handleError(err, res));

app.listen(PORT, () => console.log(`App is up on ${PORT}`));
