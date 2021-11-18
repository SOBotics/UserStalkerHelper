import { readFile } from "fs/promises";
import jquery from "jquery";
import { JSDOM } from "jsdom";
import sinon from "sinon";
import { runInNewContext } from "vm";

const { window } = new JSDOM(`<div class="topbar-menu-links">?</div>`);

const script = await readFile("./UserStalkerHelper.user.js", {
    encoding: "utf-8",
});

runInNewContext(script, {
    GM_xmlhttpRequest: () => Promise.resolve(),
    $: jquery(window),
    window,
    CHAT: sinon.mock(),
});

describe("UserStalkerHelper", () => {
    it("should correctly set up", () => {});
});
