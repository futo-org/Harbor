package tech.futo.libPolycentric.services

enum class ClientState {
    UNINITIALIZED,
    INITIALIZING,
    READY,
    ERROR,
}

enum class InitializationStep(val message: String) {
    STARTING("Starting initialization..."),
    INITIALIZING_FFI("Initializing FFI..."),
    LOADING_PROCESS_ID("Loading process ID..."),
    CREATING_PROCESS_ID("Creating process ID..."),
    COMPLETE("Initialization complete."),
}
