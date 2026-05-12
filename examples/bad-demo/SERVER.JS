// All-caps filename + mixed responsibilities — server + business logic
// in one file with no error handling. Intentional.
const http = require('http');

const items = [];

http
  .createServer((req, res) => {
    if (req.url === '/add') {
      items.push(Date.now());
      res.end('ok');
      return;
    }
    res.end(items.join(','));
  })
  .listen(3000);

console.log('listening on 3000');
