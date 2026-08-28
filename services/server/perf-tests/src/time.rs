use std::process::exit;
use std::time::{Duration, Instant};
use std::{env, panic};

use polycentric_common::models::protos_v2::feeds_service_client::FeedsServiceClient;
use polycentric_common::models::protos_v2::{
    GetExploreFeedRequest, GetFollowingFeedRequest, GetIdentityFeedRequest,
    SortPostsBy,
};
use tokio::task::JoinSet;

#[tokio::main]
async fn main() {
    let mut args = env::args();
    args.next(); // Binary name.
    let Some(address) = args.next() else {
        eprintln!("Missing address argument");
        exit(1);
    };

    let mut amount = 100;
    let mut clients = 1;
    let mut methods = Vec::new();
    while let Some(arg) = args.next() {
        let method = match arg.as_str() {
            "--amount" => {
                amount = args
                    .next()
                    .expect("missing amount")
                    .parse()
                    .expect("invalid amount");
                continue;
            }
            "--clients" => {
                clients = args
                    .next()
                    .expect("missing clients")
                    .parse()
                    .expect("invalid amount of clients");
                continue;
            }
            "GetIdentityFeed" => {
                let identity =
                    args.next().expect("missing identity for GetIdentityFeed");
                RpcMethod::GetIdentityFeed(identity)
            }
            "GetFollowingFeed" => {
                let identity =
                    args.next().expect("missing identity for GetIdentityFeed");
                RpcMethod::GetFollowingFeed(identity)
            }
            "GetRecommendedFeed" => {
                let identity =
                    args.next().expect("missing identity for GetIdentityFeed");
                RpcMethod::GetRecommendedFeed(identity)
            }
            "GetExploreFeed" => RpcMethod::GetExploreFeed,
            "GetPostThread" => RpcMethod::GetPostThread,
            "GetAttributionFeed" => RpcMethod::GetAttributionFeed,
            arg => panic!("unknown option/rpc method '{arg}'"),
        };
        methods.push(method);
    }

    if methods.is_empty() {
        eprintln!("No rpc methods to time.");
        exit(1);
    }

    let start = Instant::now();
    println!("Connecting to {address}");
    let mut set = JoinSet::new();
    for method in methods {
        println!("Timing {method:?} {amount} times using {clients} clients...");
        let amount_per = amount / clients;
        for _ in 0..clients {
            set.spawn(time(address.clone(), method.clone(), amount_per));
        }
    }

    while let Some(res) = set.join_next().await {
        match res {
            Ok(()) => {}
            Err(err) if err.is_panic() => {
                panic::resume_unwind(err.into_panic())
            }
            Err(err) => panic!("Unexpected error: {err}"),
        }
    }

    println!("All methods took {:?}", start.elapsed());
}

/// Matches ContentBody variants.
#[derive(Clone, Debug)]
enum RpcMethod {
    // FeedsService
    GetIdentityFeed(String),
    GetFollowingFeed(String),
    GetRecommendedFeed(String),
    GetExploreFeed,
    GetPostThread,
    GetAttributionFeed,
}

async fn time(address: String, method: RpcMethod, amount: usize) {
    match method {
        RpcMethod::GetIdentityFeed(identity) => {
            time_get_idenitity_feed(address, amount, identity).await
        }
        RpcMethod::GetFollowingFeed(follower_identity) => {
            time_following_feed(address, amount, follower_identity).await
        }
        RpcMethod::GetRecommendedFeed(follower_identity) => {
            time_recommended_feed(address, amount, follower_identity).await
        }
        RpcMethod::GetExploreFeed => time_explore_feed(address, amount).await,
        method => todo!("supported rpc method {method:?}"),
    }
}

async fn time_get_idenitity_feed(
    address: String,
    amount: usize,
    identity: String,
) {
    let mut client = feeds_client(address).await;
    let mut total = Duration::ZERO;
    for _ in 0..amount {
        let request = GetIdentityFeedRequest {
            identity: identity.to_owned(),
            page_params: None,
            omit_labels: Vec::new(),
        };
        let start = Instant::now();
        client.get_identity_feed(request).await.unwrap();
        total += start.elapsed();
    }
    let avg = total / amount as u32;
    println!("{amount} requests took {total:?}, {avg:?} on average");
}

async fn time_following_feed(
    address: String,
    amount: usize,
    follower_identity: String,
) {
    let mut client = feeds_client(address).await;
    let mut total = Duration::ZERO;
    for _ in 0..amount {
        let request = GetFollowingFeedRequest {
            follower_identity: follower_identity.clone(),
            page_params: None,
            omit_labels: Vec::new(),
            sort_by: Some(SortPostsBy::Default as i32),
        };
        let start = Instant::now();
        client.get_following_feed(request).await.unwrap();
        total += start.elapsed();
    }
    let avg = total / amount as u32;
    println!("{amount} requests took {total:?}, {avg:?} on average");
}

async fn time_recommended_feed(
    address: String,
    amount: usize,
    follower_identity: String,
) {
    let mut client = feeds_client(address).await;
    let mut total = Duration::ZERO;
    for _ in 0..amount {
        let request = GetFollowingFeedRequest {
            follower_identity: follower_identity.clone(),
            page_params: None,
            omit_labels: Vec::new(),
            sort_by: Some(SortPostsBy::Default as i32),
        };
        let start = Instant::now();
        client.get_recommended_feed(request).await.unwrap();
        total += start.elapsed();
    }
    let avg = total / amount as u32;
    println!("{amount} requests took {total:?}, {avg:?} on average");
}

async fn time_explore_feed(address: String, amount: usize) {
    let mut client = feeds_client(address).await;
    let mut total = Duration::ZERO;
    for _ in 0..amount {
        let request = GetExploreFeedRequest {
            identity: None,
            page_params: None,
            omit_labels: Vec::new(),
            sort_by: Some(SortPostsBy::Default as i32),
        };
        let start = Instant::now();
        client.get_explore_feed(request).await.unwrap();
        total += start.elapsed();
    }
    let avg = total / amount as u32;
    println!("{amount} requests took {total:?}, {avg:?} on average");
}

async fn feeds_client(
    address: String,
) -> FeedsServiceClient<tonic::transport::Channel> {
    FeedsServiceClient::connect(address)
        .await
        .expect("failed to connect")
}
