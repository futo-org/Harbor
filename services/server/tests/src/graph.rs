//! Tests for the graph service.

use crate::*;
use polycentric_common::models::protos_v2::graph_service_client::GraphServiceClient;
use prost::Message;

#[tokio::test]
async fn following() {
    let mut search = graph_service().await;

    let mut follower = TestClient::new().await;
    let mut followees = Vec::with_capacity(2);
    for _ in 0..followees.capacity() {
        let mut followee = TestClient::new().await;
        followee.submit_events().await; // Create the indetity.
        let id = followee.identity().to_owned();
        follower.follow_identity(id.clone(), DEFAULT_CREATED_AT);
        followees.push(id);
    }
    let last_follow = follower.get_last_event_key();
    follower.submit_events().await;
    eprintln!("Follower: {}", follower.identity());
    eprintln!("Followees: {followees:?}");

    check_following(&mut search, follower.identity().to_owned(), &followees)
        .await;
    check_followers(&mut search, followees[1].clone(), &[follower.identity()])
        .await;

    follower.delete_key(last_follow, DEFAULT_CREATED_AT + 1);
    let no_followers = followees.pop().unwrap();
    follower.submit_events().await;

    check_following(&mut search, follower.identity().to_owned(), &followees)
        .await;
    check_followers(&mut search, no_followers, &[]).await;
}

async fn check_following(
    search: &mut GraphServiceClient<tonic::transport::Channel>,
    for_identity: String,
    expected: &[String],
) {
    let result = search
        .list_following(ListFollowingRequest {
            identity: for_identity.clone(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(result.event_bundles.len(), expected.len());
    for event in &result.event_bundles {
        let signed_event =
            Event::decode(&*event.signed_event.as_ref().unwrap().event_bytes)
                .unwrap();
        let followee_identity = signed_event.key.unwrap().identity;
        assert_eq!(followee_identity, for_identity);

        let content = Content::decode(
            &*event.serialized_content.as_ref().unwrap().content_bytes,
        )
        .unwrap();
        let Some(ContentBody::Follow(follow)) = content.content_body else {
            panic!("unexpected event content: {content:?}");
        };
        assert!(
            expected.contains(&follow.identity),
            "id: {}, expected: {expected:?}",
            follow.identity
        );
    }
}

async fn check_followers(
    search: &mut GraphServiceClient<tonic::transport::Channel>,
    for_identity: String,
    expected: &[&str],
) {
    let result = search
        .list_followers(ListFollowersRequest {
            identity: for_identity.clone(),
            page_params: None,
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(result.event_bundles.len(), expected.len());
    for event in &result.event_bundles {
        let signed_event =
            Event::decode(&*event.signed_event.as_ref().unwrap().event_bytes)
                .unwrap();
        let followee_identity = signed_event.key.unwrap().identity;
        assert!(
            expected.contains(&&*followee_identity),
            "id: {}, expected: {expected:?}",
            followee_identity
        );

        let content = Content::decode(
            &*event.serialized_content.as_ref().unwrap().content_bytes,
        )
        .unwrap();
        let Some(ContentBody::Follow(follow)) = content.content_body else {
            panic!("unexpected event content: {content:?}");
        };
        assert_eq!(for_identity, follow.identity);
    }
}

#[tokio::test]
async fn suggest_follow_not_following_anyone() {
    let mut client = TestClient::new().await;
    client.submit_events().await;

    let expected_suggestions = Vec::new();
    let expected_hints = Vec::new();

    eprintln!(
        "NOTE: if you have any rows in `default_follow_suggestion` this will fail"
    );
    suggest_follow(&client, expected_suggestions, expected_hints).await;
}

#[tokio::test]
async fn suggest_follow_no_profile_updates() {
    let mut client = TestClient::new().await;
    client.submit_events().await;
    let suggested = client.identity();

    let mut followees = Vec::with_capacity(2);
    for _ in 0..followees.capacity() {
        let mut client = TestClient::new().await;
        client.follow_identity(suggested.to_owned(), DEFAULT_CREATED_AT);
        client.submit_events().await;
        followees.push(client.identity().to_owned());
    }

    let mut client = TestClient::new().await;
    for followee in followees.iter() {
        client.follow_identity(followee.clone(), DEFAULT_CREATED_AT);
    }
    client.submit_events().await;

    let expected_hints = vec![
        ExpectedHint {
            identity: suggested.to_owned(),
            expect_profile: false,
            expect_follow: Vec::new(),
        },
        ExpectedHint {
            identity: followees[0].clone(),
            expect_profile: false,
            expect_follow: vec![suggested.to_owned()],
        },
        ExpectedHint {
            identity: followees[1].clone(),
            expect_profile: false,
            expect_follow: vec![suggested.to_owned()],
        },
    ];
    let expected_suggestions = vec![ExpectedFollowSuggestion {
        suggestion: suggested.to_owned(),
        followers: followees,
    }];

    suggest_follow(&client, expected_suggestions, expected_hints).await;
}

#[tokio::test]
async fn suggest_follow_with_profile_updates() {
    let mut client = TestClient::new().await;
    client.profile_update(
        ProfileUpdate {
            name: Some(random_string()),
            avatar: None,
            banner: None,
            description: None,
            alias: None,
        },
        DEFAULT_CREATED_AT,
    );
    client.submit_events().await;
    let suggested = client.identity();

    let mut followees = Vec::with_capacity(2);
    for _ in 0..followees.capacity() {
        let mut client = TestClient::new().await;
        client.profile_update(
            ProfileUpdate {
                name: Some(random_string()),
                avatar: None,
                banner: None,
                description: None,
                alias: None,
            },
            DEFAULT_CREATED_AT,
        );
        client.follow_identity(suggested.to_owned(), DEFAULT_CREATED_AT);
        client.submit_events().await;
        followees.push(client.identity().to_owned());
    }

    let mut client = TestClient::new().await;
    for followee in followees.iter() {
        client.follow_identity(followee.clone(), DEFAULT_CREATED_AT);
    }
    client.submit_events().await;

    let expected_hints = vec![
        ExpectedHint {
            identity: suggested.to_owned(),
            expect_profile: true,
            expect_follow: Vec::new(),
        },
        ExpectedHint {
            identity: followees[0].clone(),
            expect_profile: true,
            expect_follow: vec![suggested.to_owned()],
        },
        ExpectedHint {
            identity: followees[1].clone(),
            expect_profile: true,
            expect_follow: vec![suggested.to_owned()],
        },
    ];
    let expected_suggestions = vec![ExpectedFollowSuggestion {
        suggestion: suggested.to_owned(),
        followers: followees,
    }];

    suggest_follow(&client, expected_suggestions, expected_hints).await;
}

#[tokio::test]
async fn suggest_follow_exclude_self() {
    // The client themselves.
    let mut client = TestClient::new().await;
    client.submit_events().await;

    // Two identities that both follow the client and the client follows them.
    for _ in 0..2 {
        let mut followee_client = TestClient::new().await;
        followee_client
            .follow_identity(client.identity().to_owned(), DEFAULT_CREATED_AT);
        followee_client.submit_events().await;
        client.follow_identity(
            followee_client.identity().to_owned(),
            DEFAULT_CREATED_AT,
        );
    }
    client.submit_events().await;

    // We don't want a suggestion to follow ourselves.
    let expected_suggestions = Vec::new();
    let expected_hints = Vec::new();

    suggest_follow(&client, expected_suggestions, expected_hints).await;
}

#[tokio::test]
async fn suggest_follow_exclude_already_following() {
    // The client themselves.
    let mut client = TestClient::new().await;
    client.submit_events().await;

    let mut suggested_client = TestClient::new().await;
    suggested_client.submit_events().await;

    // Two identities that both follow the client and the client follows them.
    for _ in 0..2 {
        let mut followee_client = TestClient::new().await;
        followee_client.follow_identity(
            suggested_client.identity().to_owned(),
            DEFAULT_CREATED_AT,
        );
        followee_client.submit_events().await;
        client.follow_identity(
            followee_client.identity().to_owned(),
            DEFAULT_CREATED_AT,
        );
    }

    client.follow_identity(
        suggested_client.identity().to_owned(),
        DEFAULT_CREATED_AT,
    );
    client.submit_events().await;

    // Since all identities are already followed we don't get any suggestions.
    let expected_suggestions = Vec::new();
    let expected_hints = Vec::new();

    suggest_follow(&client, expected_suggestions, expected_hints).await;
}

#[tokio::test]
async fn suggest_follow_pagination() {
    let mut suggested = Vec::with_capacity(3);
    for _ in 0..suggested.capacity() {
        let mut client = TestClient::new().await;
        client.profile_update(
            ProfileUpdate {
                name: Some(random_string()),
                avatar: None,
                banner: None,
                description: None,
                alias: None,
            },
            DEFAULT_CREATED_AT,
        );
        client.submit_events().await;
        suggested.push(client.identity().to_owned());
    }

    let mut followees = Vec::with_capacity(3);
    for n in 0..followees.capacity() {
        let mut client = TestClient::new().await;
        client.profile_update(
            ProfileUpdate {
                name: Some(random_string()),
                avatar: None,
                banner: None,
                description: None,
                alias: None,
            },
            DEFAULT_CREATED_AT,
        );
        for identity in &suggested[0..suggested.len() - n] {
            client.follow_identity(identity.to_owned(), DEFAULT_CREATED_AT);
        }
        client.submit_events().await;
        followees.push(client.identity().to_owned());
    }

    let mut client = TestClient::new().await;
    for followee in followees.iter() {
        client.follow_identity(followee.clone(), DEFAULT_CREATED_AT);
    }
    client.submit_events().await;

    let expected = vec![
        (
            ExpectedFollowSuggestion {
                suggestion: suggested[0].clone(),
                followers: vec![
                    followees[0].clone(),
                    followees[1].clone(),
                    followees[2].clone(),
                ],
            },
            vec![
                ExpectedHint {
                    identity: suggested[0].clone(),
                    expect_profile: true,
                    expect_follow: Vec::new(),
                },
                ExpectedHint {
                    identity: followees[0].clone(),
                    expect_profile: true,
                    expect_follow: vec![suggested[0].clone()],
                },
                ExpectedHint {
                    identity: followees[1].clone(),
                    expect_profile: true,
                    expect_follow: vec![suggested[0].clone()],
                },
                ExpectedHint {
                    identity: followees[2].clone(),
                    expect_profile: true,
                    expect_follow: vec![suggested[0].clone()],
                },
            ],
        ),
        (
            ExpectedFollowSuggestion {
                suggestion: suggested[1].clone(),
                followers: vec![followees[0].clone(), followees[1].clone()],
            },
            vec![
                ExpectedHint {
                    identity: suggested[1].clone(),
                    expect_profile: true,
                    expect_follow: Vec::new(),
                },
                ExpectedHint {
                    identity: followees[0].clone(),
                    expect_profile: true,
                    expect_follow: vec![suggested[1].clone()],
                },
                ExpectedHint {
                    identity: followees[1].clone(),
                    expect_profile: true,
                    expect_follow: vec![suggested[1].clone()],
                },
            ],
        ),
        (
            ExpectedFollowSuggestion {
                suggestion: suggested[2].clone(),
                followers: vec![followees[0].clone()],
            },
            vec![
                ExpectedHint {
                    identity: suggested[2].clone(),
                    expect_profile: true,
                    expect_follow: Vec::new(),
                },
                ExpectedHint {
                    identity: followees[0].clone(),
                    expect_profile: true,
                    expect_follow: vec![suggested[2].clone()],
                },
            ],
        ),
    ];

    let auth_token = client.create_auth_token();
    let mut client = graph_service().await;

    let mut page_info: Option<PageInfo> = None;
    for (expected_suggestion, expected_hints) in expected {
        suggest_follow2(
            async {
                let mut request = tonic::Request::new(SuggestFollowRequest {
                    page_params: Some(PageParams {
                        limit: Some(1),
                        backward_token: None,
                        forward_token: page_info.take().map(|i| i.end_cursor),
                    }),
                });
                request.metadata_mut().insert(
                    "authorization",
                    auth_token.clone().try_into().unwrap(),
                );
                let mut result =
                    client.suggest_follow(request).await.unwrap().into_inner();
                page_info = result.page_info.take();
                result
            },
            vec![expected_suggestion],
            expected_hints,
        )
        .await;
    }
}

#[derive(Debug)]
struct ExpectedFollowSuggestion {
    suggestion: String,
    followers: Vec<String>,
}

#[derive(Debug)]
struct ExpectedHint {
    identity: String,
    expect_profile: bool,
    expect_follow: Vec<String>,
}

async fn suggest_follow(
    identity: &TestClient,
    expected_suggestions: Vec<ExpectedFollowSuggestion>,
    expected_hints: Vec<ExpectedHint>,
) {
    suggest_follow2(
        async {
            eprintln!("Own identity: {}", identity.identity());
            let mut client = graph_service().await;
            let auth_token = identity.create_auth_token();
            let mut request =
                tonic::Request::new(SuggestFollowRequest { page_params: None });
            request
                .metadata_mut()
                .insert("authorization", auth_token.try_into().unwrap());
            client.suggest_follow(request).await.unwrap().into_inner()
        },
        expected_suggestions,
        expected_hints,
    )
    .await;
}

async fn suggest_follow2<Fut>(
    request: Fut,
    expected_suggestions: Vec<ExpectedFollowSuggestion>,
    expected_hints: Vec<ExpectedHint>,
) where
    Fut: Future<Output = SuggestFollowResponse>,
{
    eprintln!("expected suggestions: {expected_suggestions:#?}");
    let mut result = request.await;
    eprintln!("actual suggestions: {:#?}", &result.suggestions);

    assert_eq!(result.suggestions.len(), expected_suggestions.len());
    for (got, mut expected) in
        result.suggestions.iter_mut().zip(expected_suggestions)
    {
        let suggestion = got.suggestion.as_ref().unwrap();

        let content = Content::decode(
            &*suggestion
                .serialized_content
                .as_ref()
                .unwrap()
                .content_bytes,
        )
        .unwrap();
        if !matches!(&content.content_body, Some(ContentBody::Identity(_))) {
            panic!("unexpected event content: {content:?}");
        };

        let event = Event::decode(
            &*suggestion.signed_event.as_ref().unwrap().event_bytes,
        )
        .unwrap();
        let got_identity = event.key.unwrap().identity;
        assert_eq!(got_identity, expected.suggestion);

        // The ordering of the followers is not stable, sort the actual and
        // expected value before comparing.
        got.followers.sort();
        expected.followers.sort();
        assert_eq!(got.followers, expected.followers);
    }

    eprintln!("expected hints: {expected_hints:#?}");
    eprintln!("actual hints: {:#?}", &result.event_hints);

    for ExpectedHint {
        identity,
        expect_profile,
        expect_follow,
    } in expected_hints
    {
        let mut found_identity_hint = false;
        let mut found_profile_hint = !expect_profile;
        let mut unfound_follow_events: Vec<&str> =
            expect_follow.iter().map(String::as_str).collect();

        for hint in &result.event_hints {
            let bundle = hint.event_bundle.as_ref().unwrap();

            let event = Event::decode(
                &*bundle.signed_event.as_ref().unwrap().event_bytes,
            )
            .unwrap();
            let got_identity = event.key.unwrap().identity;
            if got_identity != identity {
                continue;
            }

            let content = Content::decode(
                &*bundle.serialized_content.as_ref().unwrap().content_bytes,
            )
            .unwrap();
            match &content.content_body {
                Some(ContentBody::Follow(follow)) => {
                    let Some(idx) = unfound_follow_events
                        .iter()
                        .position(|e| **e == follow.identity)
                    else {
                        panic!("unexpected follow event content: {follow:?}");
                    };
                    unfound_follow_events.remove(idx);
                }
                Some(ContentBody::ProfileUpdate(_)) => {
                    found_profile_hint = true;
                }
                Some(ContentBody::Identity(_)) => {
                    found_identity_hint = true;
                }
                _ => panic!("unexpected event content: {content:?}"),
            }
        }

        if !found_identity_hint {
            // The to-follow identities are in the suggestions.
            for suggestion in &result.suggestions {
                let bundle = suggestion.suggestion.as_ref().unwrap();
                let event = Event::decode(
                    &*bundle.signed_event.as_ref().unwrap().event_bytes,
                )
                .unwrap();
                let got_identity = event.key.unwrap().identity;
                if got_identity != identity {
                    continue;
                }

                let content = Content::decode(
                    &*bundle.serialized_content.as_ref().unwrap().content_bytes,
                )
                .unwrap();
                if !matches!(
                    &content.content_body,
                    Some(ContentBody::Identity(_))
                ) {
                    panic!("unexpected event content: {content:?}");
                };
                found_identity_hint = true;
                break;
            }
        }

        assert!(
            found_identity_hint,
            "didn't get an identity hint for {identity}"
        );
        assert!(
            found_profile_hint,
            "didn't get a profile hint for {identity}"
        );
        assert!(
            unfound_follow_events.is_empty(),
            "didn't get a follow hint for {identity}: {unfound_follow_events:?} (all expected: {expect_follow:?})"
        );
    }
}
