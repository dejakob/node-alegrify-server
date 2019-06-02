async function retry(fn, times) {
    let thisTry = 1;

    try {
        return await fn();
    }
    catch (ex) {
        if (thisTry < times) {
            return await retry(fn, times - 1)
        }
        
        throw ex;
    }
}

module.exports = {
    retry
};