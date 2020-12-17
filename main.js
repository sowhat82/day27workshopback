// load the libs
const express = require('express')
const MongoClient = require('mongodb').MongoClient;
const morgan = require ('morgan')
const url = 'mongodb://localhost:27017' /* connection string */
const mysql = require('mysql2/promise')
const secureEnv = require('secure-env')
global.env = secureEnv({secret:'mySecretPassword'})
const bodyParser = require('body-parser');
const DATABASE = 'boardgames'
const COLLECTION = 'reviews'

// for cloud storage using env variables
// const mongourl = `mongodb+srv://${MONGO_USER}:${MONGO_PASSWORD}@cluster0.ow18z.mongodb.net/<dbname>?retryWrites=true&w=majority`

// create a client pool
const client = new MongoClient(url, {useNewUrlParser: true, useUnifiedTopology: true });    

// configure port
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

// to allow searching based on ObjectID
var ObjectId = require('mongodb').ObjectID;

// create an instance of the application
const app = express()
app.use(morgan('combined'))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

//start server
const startApp = async (app, pool) => {
	const conn = await pool.getConnection()
	try {
		console.info('Pinging database...')
		await conn.ping()

        client.connect()
        .then(() => {
            app.listen(PORT, () => {
                console.info(`Application started on port ${PORT} at ${new Date()}`)        
            })
        })
        .catch(e => {
                console.error('cannot connect to mongodb: ', e)
        })

    } catch(e) {
		console.error('Cannot ping database', e)
	} finally {
		conn.release()
	}
}
// create connection pool
const pool = mysql.createPool({
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT) || 3306,
	database: 'bgg',
	user: process.env.DB_USER || global.env.DB_USER,
	password: process.env.DB_PASSWORD || global.env.DB_PASSWORD,
	connectionLimit: 4
})
// start the app
startApp(app, pool)
app.post('/review', async (req, resp) => {

    const user = req.body.user;
    const rating = parseFloat(req.body.rating);
    const comment = req.body.comment;
    const ID = parseInt(req.body.ID);
    const posted = new Date()
    
    try{

        // get the name based on ID to be passed into the next portion
        const games = await client.db(DATABASE)
        .collection('games')
        .find(
            {
                ID: ID
            }        
        )
        .project({ Name:1})
        .toArray()

        console.info(games)
        if (games.length <= 0 ){
            resp.status(404)
            resp.json({ message: `Cannot find game ${ID}`})
            return
        }

        // add new review into database
        const result = await client.db(DATABASE)
        .collection(COLLECTION)
        .insertOne({
            user:  user,
            rating: rating,
            comment: comment,
            ID: ID,
            posted: new Date(),
            name: games[0].Name
        })

        resp.status(200)
        resp.type('application/json')
        resp.json(result)

    }
    catch(e){
        resp.status(500)
        console.info(e)
        resp.json({e})
    }

});

app.put('/review/:reviewID', async (req, resp) => {

    
    const rating = parseFloat(req.body.rating);
    const comment = req.body.comment;
    const posted = new Date()
    
    try{
        const reviewID = ObjectId(req.params.reviewID);
   
        // add updated review into database as an array of embedded objects. "edited" automatically becomes an array
        const result = await client.db(DATABASE)
        .collection(COLLECTION)
        .updateOne(
            {
                _id: reviewID
            },
            {
                $push : {edited: 
                    {comment: comment, rating: rating, posted: posted}
                }
            },
            {
                upsert: true
            }
        )

        resp.status(200)
        resp.type('application/json')
        resp.json(result)

    }
    catch(e){
        resp.status(500)
        resp.json({error: e.message})
    }

});

app.get('/review/:reviewID/history/', async (req, resp) => {
    

    try{
        const reviewID = ObjectId(req.params.reviewID);
   
        const result = await client.db(DATABASE)
        .collection(COLLECTION)
        .findOne(
            {
                _id: reviewID
            },
            
        )

        resp.status(200)
        resp.type('application/json')
        resp.json(result)
    }
    catch(e){
        resp.status(500)
        resp.json({error: e.message})
    }

});

app.get('/review/:reviewID', async (req, resp) => {
    
    try{
        const reviewID = ObjectId(req.params.reviewID);
   
        // add updated review into database as an array of embedded objects. "edited" automatically becomes an array
        const result = await client.db(DATABASE)
        .collection(COLLECTION)
        .findOne(
            {
                _id: reviewID
            },
            
        )
        var latestRating = 0.0

        if ('edited' in result){
            latestRating = result.edited[result.edited.length-1]['rating'];
            latestDate = result.edited[result.edited.length-1]['posted'];
            var edited = true;
        }
        else{
            edited = false;
        }

        resp.status(200)
        // resp.type('application/json')
        resp.json({rating: latestRating, edited: edited, date: latestDate})

    }
    catch(e){
        resp.status(500)
        resp.json({error: e.message})
    }

});

// get game with highest rating
app.get('/games/lowest', async (req, resp) => {
    
    try{
   
        const result = await client.db(DATABASE)
        .collection(COLLECTION)
        .find(
        ).sort({rating: 1}).limit(1).toArray()

        resp.status(200)
        resp.type('application/json')
        resp.json(result)

    }
    catch(e){
        resp.status(500)
        resp.json({error: e.message})
    }

});

app.get('/games/min/:rating', async (req, resp) => {
    
    const minRating = parseFloat(req.params.rating);

    try{
   
        const result = await client.db(DATABASE)
        .collection(COLLECTION)
        .find(
            {
                rating: {$gte: minRating}
            }
        ).sort({rating: 1}).limit(100).toArray()

        resp.status(200)
        resp.type('application/json')
        // resp.json(result)
        resp.json({
            minRating: minRating,
            games: [result],
            Timestamp: new Date()
        })

    }
    catch(e){
        resp.status(500)
        resp.json({error: e.message})
    }

});
