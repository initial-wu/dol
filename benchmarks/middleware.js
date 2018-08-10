
'use strict';

const http = require('http');
const App = require('..');
const app = new App();

// number of middleware

let n = parseInt(process.env.MW || '1', 10);
let useAsync = process.env.USE_ASYNC === 'true';

console.log(`  ${n}${useAsync ? ' async' : ''} middleware`);

while (n--) {
  if (useAsync) {
    app.use(async(ctx, next) => await next());
  } else {
    app.use((ctx, next) => next());
  }
}

const body = Buffer.from('Hello World');

if (useAsync) {
  app.use(async({ response }, next) => { await next(); response.body = body; });
} else {
  app.use(({ response }, next) => next().then(() => response.body = body));
}

http.createServer(app.callback()).listen(3334);
