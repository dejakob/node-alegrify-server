async function clearAllState() {
    await page.evaluate(() => {
        window.localStorage.clear();
        (function removeCookies() {
            var res = document.cookie;
            var multiple = res.split(";");
            for(var i = 0; i < multiple.length; i++) {
                var key = multiple[i].split("=");
                document.cookie = key[0]+" =; expires = Thu, 01 Jan 1970 00:00:00 UTC";
            }
        })();
    });
}

module.exports = {
    clearAllState
};