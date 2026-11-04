# ubrn's generated build.gradle always lists this file as consumerProguardFiles, but
# ubrn only generates it for --native-bindings (upstream issue #502), and AGP 9 fails
# the release build when it's missing
