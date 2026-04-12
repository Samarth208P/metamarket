import { connectDB, createServer } from "./index.mjs";
import express from "express";
import path from "node:path";
//#region mapi/server/standalone.ts
var port = process.env.PORT || 8080;
async function start() {
	await connectDB();
	const app = await createServer();
	const __dirname = import.meta.dirname;
	const distPath = path.join(__dirname, "../../dist");
	app.use(express.static(distPath));
	app.get(/^\/.*/, (req, res) => {
		if (req.path.startsWith("/mapi/")) return res.status(404).json({ error: "API endpoint not found" });
		res.sendFile(path.join(distPath, "index.html"));
	});
	app.listen(port, () => {
		console.log(`🚀 Metamarket standalone server running on port ${port}`);
	});
}
start().catch((error) => {
	console.error("Failed to start standalone server:", error);
	process.exit(1);
});
//#endregion
export {};

//# sourceMappingURL=standalone.mjs.map