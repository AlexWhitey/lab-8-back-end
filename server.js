'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const pg = require('pg');
const cors = require('cors');

// Load environment variables from .env file
require('dotenv').config();

// Database Setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

// Application Setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// API Routes
app.get('/location', (request, response) => {
  getLocation(request.query.data)
    .then(location => {
      console.log('27', location);
      response.send(location)
    })
    .catch(error => handleError(error, response));
})

app.get('/weather', getWeather);
app.get('/meetups', getMeetups);
app.get('/movies', getMovies);
app.get('/trails', getTrails);
app.get('/yelp', getYelp);

// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// *********************
// MODELS
// *********************

function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.formatted_address;
  this.latitude = res.geometry.location.lat;
  this.longitude = res.geometry.location.lng;
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

function Meetup(meetup) {
  this.link = meetup.link;
  this.name = meetup.group.name;
  this.creation_date = new Date(meetup.group.created).toString().slice(0, 15);
  this.host = meetup.group.who;
}

function Movie(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/original${movie.poster_path}`;
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}

function Trail(trail) {
  this.name = trail.name;
  this.location = trail.location;
  this.length = trail.length;
  this.stars = trail.stars;
  this.star_votes = trail.starVotes;
  this.summary = trail.summary;
  this.trail_url = trail.url;
  this.conditions = trail.conditionDetails;
  this.condition_date = trail.conditionDate.slice(0,10);
  this.condition_time = trail.conditionDate.slice(11);
}

function Yelp(yelp) {
  this.name = yelp.name;
  this.image_url = yelp.image_url;
  this.price = yelp.price;
  this.rating = yelp.rating;
  this.url = yelp.url;
}
// *********************
// HELPER FUNCTIONS
// *********************

function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

function getLocation(query) {
  // CREATE the query string to check for the existence of the location
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [query];

  // Make the query of the database
  return client.query(SQL, values)
    .then(result => {
      // Check to see if the location was found and return the results
      if (result.rowCount > 0) {
        console.log('From SQL');
        return result.rows[0];

        // Otherwise get the location information from the Google API
      } else {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

        return superagent.get(url)
          .then(data => {
            console.log('FROM API line 96');
            // Throw an error if there is a problem with the API request
            if (!data.body.results.length) { throw 'no Data' }

            // Otherwise create an instance of Location
            else {
              let location = new Location(query, data.body.results[0]);
              // console.log('105', location);

              // Create a query string to INSERT a new record with the location data
              let newSQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id;`;
              // console.log('109', newSQL)
              let newValues = Object.values(location);
              // console.log('111', newValues)

              // Add the record to the database
              return client.query(newSQL, newValues)
                .then(result => {
                  // console.log('116', result.rows);
                  // Attach the id of the newly created record to the instance of location.
                  // This will be used to connect the location to the other databases.
                  // console.log('119', result.rows[0].id)
                  location.id = result.rows[0].id;
                  return location;
                })
                .catch(console.error);
            }
          })
          .catch(error => console.log('Error in SQL Call'));
      }
    });
}

function getWeather(request, response) {
  //CREATE the query string to check for the existence of the location
  const SQL = `SELECT * FROM weathers WHERE location_id=$1`;
  const values = [request.query.data.id];
  console.log('152', values);
  //Make the query of the databse
  return client.query(SQL, values)
    .then(result => {
      //Check to see if the location was found and return the results
      if (result.rowCount > 0) {
        console.log('From SQL');
        response.send(result.rows[0]);
        // Otherwise get the location information from Dark Sky
      } else {
        const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

        superagent.get(url)
          .then(result => {
            const weatherSummaries = result.body.daily.data.map(day => {
              const summary = new Weather(day);
              return summary;
            });
            let newSQL = `INSERT INTO weathers(forecast, time, location_id) VALUES ($1, $2, $3)`;
            // console.log('154', weatherSummaries) //Array of objects
            weatherSummaries.forEach( summary => {
              let newValues = Object.values(summary);
              newValues.push(request.query.data.id);
              //add record to the database
              return client.query(newSQL, newValues)
                .catch(console.error);
            })
            response.send(weatherSummaries);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getMeetups(request, response) {
  const SQL = `SELECT * FROM meetups WHERE location_id=$1`;
  const values = [request.query.data.id];
  console.log('175', values);
  //Query the database
  return client.query(SQL, values)
    .then(result => {
      //check to see if the location was found and return the results
      if (result.rowCount > 0) {
        console.log('From SQL');
        response.send(result.rows[0]);
        //Otherwise get the location from MeetUps
      } else {
        const url = `https://api.meetup.com/find/upcoming_events?&sign=true&photo-host=public&lon=${request.query.data.longitude}&page=20&lat=${request.query.data.latitude}&key=${process.env.MEETUP_API_KEY}`

        superagent.get(url)
          .then(result => {
            const meetUpSummaries = result.body.events.map(meetup => {
              const event = new Meetup(meetup)
              // console.log(event);
              return event;
            })
            let newSQL = `INSERT INTO meetups(link, name, creation_date, host, location_id) VALUES ($1, $2, $3, $4, $5)`;
            // console.log('196', meetUpSummaries)
            meetUpSummaries.forEach(summary => {
              let newValues = Object.values(summary);
              newValues.push(request.query.data.id);
              //add record to databse
              return client.query(newSQL, newValues)
                .catch(console.error);
            })
            response.send(meetUpSummaries);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getMovies(request, response) {
  const SQL = `SELECT * FROM movies WHERE location_id=$1`;
  const values = [request.query.data.id];
  console.log('213', values);
  //Query the database
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('From SQL');
        response.send(result.rows[0]);
      } else {
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&language=en-US&query=${request.query.data.search_query}&page=1&include_adult=false`

        superagent.get(url)
          .then(data => {
            const movieSummary = data.body.results.map(movie => {
              const event = new Movie(movie)
              // console.log(event);
              return event;
            })
            let newSQL = `INSERT INTO movies(title, overview, average_votes, total_votes, image_url, popularity, released_on, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

            movieSummary.forEach(summary => {
              let newValues = Object.values(summary);
              newValues.push(request.query.data.id);
              //add record to database
              return client.query(newSQL, newValues)
                .catch(console.error);
            })
            response.send(movieSummary);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getTrails(request, response) {
  const SQL = `SELECT * FROM trails WHERE location_id=$1`;
  const values = [request.query.data.id];
  // console.log('264', values);
  //Query the databse
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('From SQL');
        response.send(result.rows[0]);
      } else {
        const url = `https://www.hikingproject.com/data/get-trails?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&maxDistance=10&key=${process.env.TRAIL_API_KEY}`;

        superagent.get(url)
          .then(result => {
            const trailSummary = result.body.trails.map(trail => {
              const event = new Trail(trail)
              // console.log(event);
              return event;
            })
            let newSQL = `INSERT INTO trails(name, location, length, stars, star_votes, summary, trail_url, conditions, condition_date, condition_time, location_id)  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

            trailSummary.forEach(summary => {
              let newValues = Object.values(summary);
              newValues.push(request.query.data.id);
              //add record to database
              return client.query(newSQL, newValues)
                .catch(console.error);
            })
            response.send(trailSummary);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getYelp(request, response) {
  const SQL = `SELECT * FROM yelps WHERE location_id=$1`;
  const values = [request.query.data.id];
  console.log('299', values);
  //Query the database
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('From SQL');
        response.send(result.rows[0]);
      } else {
        // Call to yelp
        const url = `https://api.yelp.com/v3/businesses/search?location=${request.query.data.search_query}`;

        superagent.get(url)
          .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
          .then(result => {
            const yelpSummary = result.body.businesses.map(yelp => {
              const event = new Yelp(yelp)
              // console.log('323', event);
              return event;
            })
            let newSQL = `INSERT INTO yelps(name, image_url, price, rating, url, location_id) VALUES ($1, $2, $3, $4, $5, $6)`;
            yelpSummary.forEach(summary => {
              let newValues = Object.values(summary);
              newValues.push(request.query.data.id);
              //add record to database
              return client.query(newSQL, newValues)
                .catch(console.error);
            })
            response.send(yelpSummary);
          })
          .catch(error => handleError(error, response));
      }
    })
}
