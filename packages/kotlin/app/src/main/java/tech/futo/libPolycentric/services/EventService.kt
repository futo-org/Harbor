package tech.futo.libPolycentric.services

import polycentric.Event
import tech.futo.libPolycentric.services.Identity

class EventService {
    private val identityChangedListeners = mutableListOf<(Identity?) -> Unit>()
    private val contentCreatedListeners = mutableListOf<(Event) -> Unit>()
    private val stateChangedListeners = mutableListOf<(ClientState) -> Unit>()
    private val progressListeners = mutableListOf<(InitializationStep) -> Unit>()
    private val errorListeners = mutableListOf<(Exception) -> Unit>()

    // Identity events
    fun emitIdentityChanged(identity: Identity?) = identityChangedListeners.forEach { it(identity) }
    fun onIdentityChanged(listener: (Identity?) -> Unit) { identityChangedListeners.add(listener) }
    fun offIdentityChanged(listener: (Identity?) -> Unit) { identityChangedListeners.remove(listener) }

    // Content events
    fun emitContentCreated(event: Event) = contentCreatedListeners.forEach { it(event) }
    fun onContentCreated(listener: (Event) -> Unit) { contentCreatedListeners.add(listener) }
    fun offContentCreated(listener: (Event) -> Unit) { contentCreatedListeners.remove(listener) }

    // State events
    fun emitStateChanged(state: ClientState) = stateChangedListeners.forEach { it(state) }
    fun onStateChanged(listener: (ClientState) -> Unit) { stateChangedListeners.add(listener) }
    fun offStateChanged(listener: (ClientState) -> Unit) { stateChangedListeners.remove(listener) }

    // Progress events
    fun emitProgress(step: InitializationStep) = progressListeners.forEach { it(step) }
    fun onProgress(listener: (InitializationStep) -> Unit) { progressListeners.add(listener) }
    fun offProgress(listener: (InitializationStep) -> Unit) { progressListeners.remove(listener) }

    // Error events
    fun emitError(error: Exception) = errorListeners.forEach { it(error) }
    fun onError(listener: (Exception) -> Unit) { errorListeners.add(listener) }
    fun offError(listener: (Exception) -> Unit) { errorListeners.remove(listener) }

    fun removeAllListeners() {
        identityChangedListeners.clear()
        contentCreatedListeners.clear()
        stateChangedListeners.clear()
        progressListeners.clear()
        errorListeners.clear()
    }
}
