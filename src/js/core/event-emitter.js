/**
 * Simple event emitter for decoupling components
 */
export default class EventEmitter {
    constructor() {
        this.events = {};
    }

    /**
     * Register an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @param {Object} context - Optional context for the callback
     */
    on(event, callback, context = null) {
        if (!this.events[event]) {
            this.events[event] = [];
        }

        this.events[event].push({
            callback: callback,
            context: context
        });
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     * @param {Object} context - Optional context
     */
    off(event, callback, context = null) {
        if (!this.events[event]) return;

        this.events[event] = this.events[event].filter(listener => {
            return !(listener.callback === callback &&
                    (context === null || listener.context === context));
        });
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to listeners
     */
    emit(event, data = null) {
        if (!this.events[event]) return;

        this.events[event].forEach(listener => {
            try {
                if (listener.context) {
                    listener.callback.call(listener.context, data);
                } else {
                    listener.callback(data);
                }
            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
            }
        });
    }

    /**
     * Remove all listeners for an event
     * @param {string} event - Event name (optional, removes all if not specified)
     */
    removeAllListeners(event = null) {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
    }

    /**
     * Get the number of listeners for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
        return this.events[event] ? this.events[event].length : 0;
    }

    /**
     * Get all event names that have listeners
     * @returns {string[]} Array of event names
     */
    eventNames() {
        return Object.keys(this.events);
    }
}