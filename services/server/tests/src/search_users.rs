//! Tests for searching users.

use crate::*;

#[tokio::test]
async fn no_match() {
    expect_searched_users(
        SearchUsersRequest {
            query: random_string(),
            sort_by: None,
            page_params: None,
        },
        Vec::new(),
    )
    .await;
}

#[tokio::test]
async fn match_profile_name() {
    let mut client = TestClient::new().await;

    let profile_name = random_string();
    let profile_update = ProfileUpdate {
        name: Some(profile_name.clone()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: profile_name.clone(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update.clone()],
    )
    .await;

    // Prefix match.
    expect_searched_users(
        SearchUsersRequest {
            query: profile_name[..5].to_owned(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update],
    )
    .await;
}

#[tokio::test]
async fn does_not_match_description() {
    let mut client = TestClient::new().await;

    let description = random_string();
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: Some(description.clone()),
        alias: None,
    };
    client.profile_update(profile_update, current_timestamp());
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: description.clone(),
            sort_by: None,
            page_params: None,
        },
        vec![],
    )
    .await;
}

#[tokio::test]
async fn match_alias() {
    let mut client = TestClient::new().await;

    let name = random_string();
    let alias = format!("{name}@futo.tech");
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: None,
        alias: Some(alias.clone()),
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    for query in [
        format!("{name}"),
        format!("{name}@"),
        format!("{name}@futo"),
        format!("{name}@futo.tech"),
        // Tests for #2010.
        format!("{name}@f"),
        format!("{name}@fu"),
        format!("{name}@fut"),
        format!("{name}@futo"),
    ] {
        expect_searched_users(
            SearchUsersRequest {
                query,
                sort_by: None,
                page_params: None,
            },
            vec![profile_update.clone()],
        )
        .await;
    }
}

#[tokio::test]
async fn match_identity() {
    let mut client = TestClient::new().await;

    let alias = random_string();
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: None,
        alias: Some(alias.clone()),
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;
    let identity = client.identity().to_owned();

    expect_searched_users(
        SearchUsersRequest {
            query: identity,
            sort_by: None,
            page_params: None,
        },
        vec![profile_update],
    )
    .await;
}

#[tokio::test]
async fn match_identity_prefix() {
    let mut client = TestClient::new().await;

    let alias = random_string();
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: None,
        alias: Some(alias.clone()),
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    for n in 4..client.identity().len() {
        expect_searched_users(
            SearchUsersRequest {
                query: client.identity()[..n].to_owned(),
                sort_by: None,
                page_params: None,
            },
            vec![profile_update.clone()],
        )
        .await;
    }
}

#[tokio::test]
async fn only_consider_latest_update() {
    let mut client = TestClient::new().await;

    let old_alias = random_string();
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: None,
        alias: Some(old_alias.clone()),
    };
    client.profile_update(profile_update, current_timestamp());
    // Remove the alias, so we shouldn't match any more.
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update, current_timestamp() + 1);
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: old_alias,
            sort_by: None,
            page_params: None,
        },
        vec![],
    )
    .await;
}

#[tokio::test]
async fn do_not_consider_deleted_updates() {
    let mut client = TestClient::new().await;

    let alias = random_string();
    let profile_update = ProfileUpdate {
        name: Some(random_string()),
        avatar: None,
        banner: None,
        description: None,
        alias: Some(alias.clone()),
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    let event_key = client.get_last_event_key();
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: alias.clone(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update],
    )
    .await;

    // After the profile update is deleted we shouldn't find the user any more.
    client.delete_key(event_key, current_timestamp() + 1);
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: alias,
            sort_by: None,
            page_params: None,
        },
        vec![],
    )
    .await;
}

#[tokio::test]
async fn match_on_hashtags() {
    let mut client = TestClient::new().await;

    let profile_name = "#a #some";
    let profile_update = ProfileUpdate {
        name: Some(profile_name.into()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    expect_searched_users(
        SearchUsersRequest {
            query: profile_name.into(),
            sort_by: None,
            // Limit to 1 post as each time we test we create another. All we're
            // interested in is that one of them is returned, not which one.
            page_params: Some(PageParams {
                limit: Some(1),
                ..Default::default()
            }),
        },
        vec![profile_update],
    )
    .await;
}

#[tokio::test]
async fn non_ascii_words_work() {
    let key = signing_key("non_ascii_words_work");
    let mut client = TestClient::new_with_identity(key).await;

    let profile_name = "「世界、こんにちは。"; // Hello, World! (according to the internet).
    let profile_update = ProfileUpdate {
        name: Some(profile_name.into()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    for query in ["世界", "こんにちは"] {
        expect_searched_users(
            SearchUsersRequest {
                query: query.to_owned(),
                sort_by: None,
                // Limit to 1 post as each time we test we create another. All we're
                // interested in is that one of them is returned, not which one.
                page_params: Some(PageParams {
                    limit: Some(1),
                    ..Default::default()
                }),
            },
            vec![profile_update.clone()],
        )
        .await;
    }
}

#[tokio::test]
async fn accents_are_ignored() {
    let key = signing_key("accents_are_ignored");
    let mut client = TestClient::new_with_identity(key).await;

    let profile_name = "Dast ist eine schön café für dich";
    let profile_update = ProfileUpdate {
        name: Some(profile_name.into()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    for query in ["schon", "fur", "cafe"] {
        expect_searched_users(
            SearchUsersRequest {
                query: query.to_owned(),
                sort_by: None,
                // Limit to 1 post as each time we test we create another. All we're
                // interested in is that one of them is returned, not which one.
                page_params: Some(PageParams {
                    limit: Some(1),
                    ..Default::default()
                }),
            },
            vec![profile_update.clone()],
        )
        .await;
    }
}

#[tokio::test]
async fn order_by_rank() {
    let query = random_string();

    let mut expected = Vec::new();
    for n in 1..=3 {
        let mut client = TestClient::new().await;
        let alias = repeated_string(n, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(random_string()),
            avatar: None,
            banner: None,
            description: None,
            alias: Some(alias),
        };
        client.profile_update(profile_update.clone(), current_timestamp());
        client.submit_events().await;
        expected.push(profile_update);
    }
    // Reverse the results as the more hits we get, the higher the rank should be.
    expected.reverse();

    expect_searched_users(
        SearchUsersRequest {
            query,
            sort_by: None,
            page_params: None,
        },
        expected,
    )
    .await;
}

#[tokio::test]
async fn order_by_alpha() {
    let query = random_string();

    let mut expected = Vec::new();
    for (n, name) in ["A", "B", "C"].into_iter().enumerate() {
        let mut client = TestClient::new().await;
        let alias = repeated_string(n + 1, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(name.to_owned()),
            avatar: None,
            banner: None,
            description: None,
            alias: Some(alias),
        };
        client.profile_update(profile_update.clone(), current_timestamp());
        client.submit_events().await;
        expected.push(profile_update);
    }

    expect_searched_users(
        SearchUsersRequest {
            query,
            sort_by: Some(SortUsersBy::Alpha as _),
            page_params: None,
        },
        expected,
    )
    .await;
}

#[tokio::test]
async fn pagination_order_by_rank() {
    let mut search = search_service().await;
    let query = random_string();

    let mut expected = Vec::new();
    for n in 1..=3 {
        let mut client = TestClient::new().await;
        let alias = repeated_string(n, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(random_string()),
            avatar: None,
            banner: None,
            description: None,
            alias: Some(alias),
        };
        client.profile_update(profile_update.clone(), current_timestamp());
        client.submit_events().await;
        expected.push(profile_update);
    }
    // Reverse the results as the more hits we get, the higher the rank should be.
    expected.reverse();

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: None,
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
            },
            vec![expected],
            |request| async {
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() != 2);
        assert_eq!(page_info.has_next_page, expected_iter.len() >= 1);
    }
    assert!(!page_info.as_ref().unwrap().has_next_page);

    // Backward.
    expected.reverse();
    let mut expected_iter = expected.clone().into_iter();
    let _ = expected_iter.next(); // Skip first (previously last) result.
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: None,
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
            },
            vec![expected],
            |request| async {
                let mut search = search_service().await;
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() >= 1);
        assert_eq!(page_info.has_next_page, true);
    }
    assert!(!page_info.as_ref().unwrap().has_previous_page);
}

#[tokio::test]
async fn pagination_order_by_alpha() {
    let mut search = search_service().await;
    let query = random_string();

    let mut expected = Vec::new();
    for (n, name) in ["A", "B", "C"].into_iter().enumerate() {
        let mut client = TestClient::new().await;
        let alias = repeated_string(n + 1, &query, " ");
        let profile_update = ProfileUpdate {
            name: Some(name.to_owned()),
            avatar: None,
            banner: None,
            description: None,
            alias: Some(alias),
        };
        client.profile_update(profile_update.clone(), current_timestamp());
        client.submit_events().await;
        expected.push(profile_update);
    }

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: Some(SortUsersBy::Alpha as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
            },
            vec![expected],
            |request| async {
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() != 2);
        assert_eq!(page_info.has_next_page, expected_iter.len() >= 1);
    }
    assert!(!page_info.as_ref().unwrap().has_next_page);

    // Backward.
    expected.reverse();
    let mut expected_iter = expected.clone().into_iter();
    let _ = expected_iter.next(); // Skip first (previously last) result.
    while let Some(expected) = expected_iter.next() {
        expect_searched_users2(
            SearchUsersRequest {
                query: query.clone(),
                sort_by: Some(SortUsersBy::Alpha as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
            },
            vec![expected],
            |request| async {
                let mut search = search_service().await;
                let SearchUsersResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_users(request).await.unwrap().into_inner();
                page_info = p_i;
                results
            },
        )
        .await;

        let page_info = page_info.as_ref().unwrap();
        assert_eq!(page_info.has_previous_page, expected_iter.len() >= 1);
        assert_eq!(page_info.has_next_page, true);
    }
    assert!(!page_info.as_ref().unwrap().has_previous_page);
}

#[tokio::test]
async fn regression_1658() {
    // Identity that is parsed as "Scientific notation" when parsing ts vectors.
    // For example:
    // ```
    // SELECT description, token FROM ts_debug('simple', '36052e2fefa35676d356782f00f3745886519595be110aa38b18ff1f287fb22c');
    // ```
    let seed = Sha256::digest(b"regression_1658_oHiUY7S8HD7kDANc")
        .try_into()
        .unwrap();
    let key = SigningKey::from_bytes(&seed);
    let mut client = TestClient::new_with_identity(key).await;

    let profile_update = ProfileUpdate {
        name: Some("Regression #1658".to_owned()),
        avatar: None,
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update.clone(), current_timestamp());
    client.submit_events().await;

    // Search using full identity.
    expect_searched_users(
        SearchUsersRequest {
            query: client.identity().to_owned(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update.clone()],
    )
    .await;

    // Search using partial identity.
    expect_searched_users(
        SearchUsersRequest {
            query: client.identity()[..10].to_owned(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update.clone()],
    )
    .await;

    // Not valid hex, but part of it.
    expect_searched_users(
        SearchUsersRequest {
            query: client.identity()[..11].to_owned(),
            sort_by: None,
            page_params: None,
        },
        vec![profile_update.clone()],
    )
    .await;
}

async fn expect_searched_users(
    request: SearchUsersRequest,
    expected: Vec<ProfileUpdate>,
) {
    expect_searched_users2(request, expected, |request| async {
        let mut search = search_service().await;
        let response = search.search_users(request).await.unwrap();
        response.into_inner().results
    })
    .await
}

async fn expect_searched_users2<F, Fut>(
    request: SearchUsersRequest,
    expected: Vec<ProfileUpdate>,
    get_results: F,
) where
    F: FnOnce(SearchUsersRequest) -> Fut,
    Fut: Future<Output = Vec<SearchResult>>,
{
    eprintln!("query: {:#?}", request.query);
    let results = get_results(request).await;
    eprintln!("expected: {expected:#?}");
    eprintln!("results: {results:#?}");

    assert_eq!(
        results.len(),
        expected.len(),
        "unexpected amount of results"
    );
    for (result, expected) in results.into_iter().zip(expected) {
        let event = result.event_bundle.unwrap();
        let Some(serialized_content) = event.serialized_content.as_ref() else {
            panic!("missing content in event: {event:?}");
        };
        let Ok(content) = Content::decode(&*serialized_content.content_bytes)
        else {
            panic!("failed to decode event: {event:?}");
        };
        let Some(ContentBody::ProfileUpdate(update)) = content.content_body
        else {
            panic!("unexpected content body: {event:?}");
        };
        assert_eq!(update, expected);
        // Hard to assert the actual rank, so just check we have it.
        assert!(result.rank >= 0.0);
    }
}
