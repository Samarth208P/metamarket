import { createServer } from "../../../mapi/server/index.ts";

const app = await createServer({ enableBinaryMarkets: true, edge: true });
app.listen(8000);
