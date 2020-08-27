const mysql = require('mysql')
const connection = mysql.createConnection({
  host: process.env.HOST,
  port: process.env.PORT,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
})

connection.connect()

connection.query('SELECT "Hello World!" AS text', (error, results, fields) => {
  if (error) throw error
  console.log(results[0].text)
})

connection.end()