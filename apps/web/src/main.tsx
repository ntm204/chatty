import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app";
import { registerServiceWorker } from "@/lib/register-service-worker";
// For its module-scope listener: a reader on System must follow the OS from the
// first screen, and the only component using the hook sits in the lazy settings chunk.
import "@/hooks/use-theme";
import "@/styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

registerServiceWorker();
