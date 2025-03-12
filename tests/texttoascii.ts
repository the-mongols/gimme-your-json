// ./tests -> Test files mirroring src structure


console.log("Hello via Bun!");

import figlet from "figlet";

const server = Bun.serve({
    port: 3000,
    fetch(req) {
      const body = figlet.textSync("bun?");
        return new Response(body);
    },
  });
  
  console.log(`Listening on http://localhost:${server.port} ...`);
  console.log(Bun.version);