const _5_MINUTES = 5 * 60 * 1000;

class CallbacksMap extends Map {
    /**
     * @param {string} key - The key under which the callback is stored.
     * @param {function} value - The callback function to store.
     * @param {number} [ttl=_5_MINUTES] - Time to live in milliseconds. Default is 5 minutes.
     * @returns {this} - Returns the instance of the CallbacksMap for chaining.
     */
    set(key, value, ttl = _5_MINUTES) {
        setTimeout(() => {
            this.delete(key);
        }, ttl);
        return super.set(key, value);
    }
}

export const appContext = {
    uploadCallbacks: new CallbacksMap(),
};
