const http = require('node:http');
const port = Number(process.env.PORT || 3000);
const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (request.method === 'GET' && request.url === '/health') {
    response.end(JSON.stringify({ status: 'healthy', marker: 'liarapilot-demo-healthy' }));
    return;
  }
  response.end(JSON.stringify({ message: 'Hello from LiaraPilot', version: '1.0.0' }));
});
server.listen(port, '0.0.0.0');
process.on('SIGTERM', () => server.close());
