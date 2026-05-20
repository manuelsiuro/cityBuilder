import { App } from "./app/App";

const mount = document.getElementById("app");
if (!mount) throw new Error("#app mount element not found");

const app = new App(mount);
await app.start();
