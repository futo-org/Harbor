mod grpc;
mod routes;

use crate::grpc::server;
use crate::routes::build_routes;

#[tokio::main]
async fn main() {
    let grpc = tokio::spawn(async { server::serve_grpc().await.unwrap() });

    let routes = build_routes();
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("HTTP server listening on http://0.0.0.0:3000");
    println!("API docs available at http://0.0.0.0:3000/docs");
    let http = tokio::spawn(async { axum::serve(listener, routes).await.unwrap() });

    tokio::try_join!(grpc, http).unwrap();
}
