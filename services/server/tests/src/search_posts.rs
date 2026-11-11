//! Tests for searching posts.

use crate::*;

#[tokio::test]
async fn no_match() {
    expect_searched_posts(
        SearchPostsRequest {
            query: random_string(),
            sort_by: None,
            page_params: None,
            omit_labels: Vec::new(),
        },
        Vec::new(),
    )
    .await;
}

#[tokio::test]
async fn match_text_exactly() {
    let key = signing_key("match_random_text_exactly");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = "According to Wikipedia Honorificabilitudinitatibus is one of the longest words in the English language";
    let query = "Honorificabilitudinitatibus";
    client.post_text(post_text, current_timestamp());
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query: query.to_owned(),
            sort_by: None,
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![Post {
            text: post_text.to_owned(),
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
            labels: vec![],
            attributed_to: vec![],
        }],
    )
    .await;
}

#[tokio::test]
async fn match_random_text_exactly() {
    let mut client = TestClient::new().await;

    let post_text = random_string();
    client.post_text(&post_text, current_timestamp());
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query: post_text.clone(),
            sort_by: None,
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![Post {
            text: post_text,
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
            labels: vec![],
            attributed_to: vec![],
        }],
    )
    .await;
}

#[tokio::test]
async fn words_are_stemmed() {
    let key = signing_key("words_are_stemmed");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = "Running down a dream!"; // https://www.youtube.com/watch?v=dXYl5NrHPb4
    client.post_text(post_text, current_timestamp());
    client.submit_events().await;

    for query in ["run", "running", "runs"] {
        expect_searched_posts_contains(
            query,
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn match_on_hashtags() {
    let key = signing_key("match_on_hashtags");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = "We can post #great #stuff with hashtags! #a #an #some .#dot ,#comma !#exclamation ?#question ?!#double \n#newline \t#tab # not";
    client.post_text(&post_text, current_timestamp());
    client.submit_events().await;

    let tests = [
        "great",
        "stuff",
        // NOTE: "a", "an" and "some" don't work as they're considered stop
        // words (i.e. not important), but with a hashtag it does work (see
        // below).
        "dot",
        "comma",
        "exclamation",
        "question",
        "double",
        "newline",
        "tab",
        // Same as above, but with hashtags.
        "#great",
        "#stuff",
        "#a",
        "#an",
        "#some",
        "#dot",
        "#comma",
        "#exclamation",
        "#question",
        "#double",
        "#newline",
        "#tab",
    ];

    for hashtag in tests {
        expect_searched_posts_contains(
            hashtag,
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn match_on_random_hashtags() {
    let mut client = TestClient::new().await;

    let hash = random_string();
    let post_text = format!("What about hashes? #{hash}.");
    client.post_text(&post_text, current_timestamp());
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query: hash.to_owned(),
            sort_by: None,
            // Limit to 1 post as each time we test we create another. All we're
            // interested in is that one of them is returned, not which one.
            page_params: Some(PageParams {
                limit: Some(1),
                ..Default::default()
            }),
            omit_labels: Vec::new(),
        },
        vec![Post {
            text: post_text.to_owned(),
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
            labels: vec![],
            attributed_to: vec![],
        }],
    )
    .await;
}

#[tokio::test]
async fn match_on_identity() {
    let mut client = TestClient::new().await;

    for identity in [
        &client.identity().to_owned(),
        "36052e2fefa35676d356782f00f3745886519595be110aa38b18ff1f287fb22c",
    ] {
        let post_text = format!("Post with identity '{identity}'");
        client.post_text(&post_text, current_timestamp());
        client.submit_events().await;

        expect_searched_posts_contains(
            identity,
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn match_on_identity_prefix() {
    let mut client = TestClient::new().await;

    let post_text = format!("Post with identity '{}'", client.identity());
    client.post_text(&post_text, current_timestamp());
    client.submit_events().await;

    for n in 4..client.identity().len() {
        expect_searched_posts_contains(
            &client.identity()[..n],
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn match_on_scientific_notation_identity_prefix() {
    // Ensure that identity `9e30a460...`, which Postgres' text search
    // parser would read as the float `9e30` followed by `a460...`, gets
    // parsed as a full identity string, and not into split lexemes.
    // This ensures that search for more characters than just the first
    // four (which are valid scientific notation by themselves, and match
    // Postgres' default lexeme parsing) match the same identity string.
    let key = signing_key("match_on_sci_notation_12");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = format!("Post with identity '{}'", client.identity());
    client.post_text(&post_text, current_timestamp());
    client.submit_events().await;

    for n in [4, 7, 8, 10, client.identity().len()] {
        expect_searched_posts(
            SearchPostsRequest {
                query: client.identity()[..n].to_owned(),
                sort_by: None,
                page_params: None,
                omit_labels: Vec::new(),
            },
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn match_on_mention() {
    let key = signing_key("match_on_mention");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = format!(
        "Let's mention someone @{{{},mark@futo.tech}}",
        client.identity()
    );
    client.post_text(&post_text, current_timestamp());
    client.submit_events().await;

    for query in [
        "mark@futo.tech",
        "mark@futo",
        "mark",
        "mark@",
        // NOTE: the following search don't work as Postgres
        //"@futo.tech",
        //"futo.tech",
        //"@futo",
        //"futo",
        client.identity(),
    ] {
        expect_searched_posts_contains(
            query,
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }

    for n in 4..client.identity().len() {
        expect_searched_posts_contains(
            &client.identity()[..n],
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn non_ascii_words_work() {
    let key = signing_key("non_ascii_words_work");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = "「世界、こんにちは。"; // Hello, World! (according to the internet).
    client.post_text(post_text, current_timestamp());
    client.submit_events().await;

    for query in ["世界", "こんにちは"] {
        expect_searched_posts(
            SearchPostsRequest {
                query: query.to_owned(),
                sort_by: None,
                page_params: None,
                omit_labels: Vec::new(),
            },
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn accents_are_ignored() {
    let key = signing_key("accents_are_ignored");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = "Dast ist eine schön café für dich";
    client.post_text(post_text, current_timestamp());
    client.submit_events().await;

    // Note "fur" matches too many posts from other tests.
    for query in ["schon", "cafe"] {
        expect_searched_posts(
            SearchPostsRequest {
                query: query.to_owned(),
                sort_by: None,
                page_params: None,
                omit_labels: Vec::new(),
            },
            vec![Post {
                text: post_text.to_owned(),
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            }],
        )
        .await;
    }
}

#[tokio::test]
async fn stop_words_are_not_included() {
    let key = signing_key("stop_words_are_not_included");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = "A or An? That is the question.";
    client.post_text(post_text, current_timestamp());
    client.submit_events().await;

    for query in ["a", "an", "the"] {
        expect_searched_posts_contains(
            query,
            Vec::new(), // Search vector should be empty, so no expected results.
        )
        .await;
    }
}

#[tokio::test]
async fn order_by_default() {
    let mut client = TestClient::new().await;

    let query = random_string();
    let post_text1 = format!("{query} first.");
    let post_text2 = format!("{query} second.");
    client.post_text(&post_text1, current_timestamp());
    client.post_text(&post_text2, current_timestamp() + 1);
    let post2_key = client.get_last_event_key();
    client.thumbs_up(post2_key, current_timestamp() + 2);
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query,
            sort_by: Some(SortPostsBy::Default as _),
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![
            Post {
                text: post_text2,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            },
            Post {
                text: post_text1,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            },
        ],
    )
    .await;
}

#[tokio::test]
async fn order_by_latest() {
    let mut client = TestClient::new().await;

    let query = random_string();
    let post_text1 = format!("{query} first.");
    let post_text2 = format!("{query} second.");
    client.post_text(&post_text1, current_timestamp());
    client.post_text(&post_text2, current_timestamp() + 1);
    client.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query,
            sort_by: Some(SortPostsBy::Latest as _),
            page_params: None,
            omit_labels: Vec::new(),
        },
        vec![
            Post {
                text: post_text2,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            },
            Post {
                text: post_text1,
                reply: None,
                images: vec![],
                quote: None,
                links: vec![],
                labels: vec![],
                attributed_to: vec![],
            },
        ],
    )
    .await;
}

#[tokio::test]
async fn omit_labels() {
    let query = random_string();
    let label = random_string();

    let mut client = TestClient::new().await;
    client.post_text(&query, current_timestamp());
    let post_event_key = client.get_last_event_key();
    client.submit_events().await;

    let (mut trusted_moderator, _guard) = TestClient::trusted_moderator().await;
    trusted_moderator.label(
        Labels {
            event_key: Some(post_event_key),
            label_values: vec![label.clone()],
        },
        current_timestamp() + 1,
    );
    trusted_moderator.submit_events().await;

    expect_searched_posts(
        SearchPostsRequest {
            query,
            sort_by: None,
            page_params: None,
            omit_labels: vec![label],
        },
        vec![], // The post should be hidden.
    )
    .await;
}

#[tokio::test]
async fn pagination_order_by_top() {
    let mut search = search_service().await;
    let query = random_string();
    let mut clients = Vec::new();
    let mut expected = Vec::new();
    let mut post_event_keys = Vec::new();
    for n in 1..=3 {
        let mut client = TestClient::new().await;
        let text = format!("{n}. {query}.");
        client.post_text(&text, current_timestamp());
        post_event_keys.push(client.get_last_event_key());
        expected.push(Post {
            text,
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
            labels: vec![],
            attributed_to: vec![],
        });
        clients.push(client);
    }
    for (n, mut client) in clients.into_iter().enumerate() {
        for post in &post_event_keys[..n + 1] {
            client.thumbs_up(post.clone(), current_timestamp());
        }
        client.submit_events().await;
    }

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: Some(SortPostsBy::Top as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
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
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: Some(SortPostsBy::Top as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
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
async fn pagination_order_by_latest() {
    let mut search = search_service().await;
    let mut client = TestClient::new().await;

    let query = random_string();
    let mut expected = Vec::new();
    for n in 1..=3 {
        let text = format!("{n}. {query}.");
        client.post_text(&text, current_timestamp() + n);
        expected.push(Post {
            text,
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
            labels: vec![],
            attributed_to: vec![],
        });
    }
    expected.reverse();
    client.submit_events().await;

    // Forward.
    let mut page_info: Option<PageInfo> = None;
    let mut expected_iter = expected.clone().into_iter();
    while let Some(expected) = expected_iter.next() {
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: Some(SortPostsBy::Latest as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: None,
                    forward_token: page_info.take().map(|i| i.end_cursor),
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
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
        expect_searched_posts2(
            SearchPostsRequest {
                query: query.clone(),
                sort_by: Some(SortPostsBy::Latest as _),
                page_params: Some(PageParams {
                    limit: Some(1),
                    backward_token: page_info.take().map(|i| i.start_cursor),
                    forward_token: None,
                }),
                omit_labels: Vec::new(),
            },
            vec![expected],
            |request| async {
                let SearchPostsResponse {
                    results,
                    page_info: p_i,
                    ..
                } = search.search_posts(request).await.unwrap().into_inner();
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
async fn regression_1570() {
    let key = signing_key("regression_1570");
    let mut client = TestClient::new_with_identity(key).await;

    let post_text = "First line\n#some\n#the";
    client.post_text(post_text, current_timestamp());
    client.submit_events().await;

    // We can match results, as long as one of them is the text we expect.
    expect_searched_posts_contains(
        "#some #the",
        vec![Post {
            text: post_text.to_owned(),
            reply: None,
            images: vec![],
            quote: None,
            links: vec![],
            labels: vec![],
            attributed_to: vec![],
        }],
    )
    .await;
}

async fn expect_searched_posts(
    request: SearchPostsRequest,
    expected: Vec<Post>,
) {
    expect_searched_posts2(request, expected, |request| async {
        let mut search = search_service().await;
        let response = search.search_posts(request).await.unwrap();
        response.into_inner().results
    })
    .await
}

async fn expect_searched_posts_contains(query: &str, mut expected: Vec<Post>) {
    eprintln!("query: {:#?}", query);
    let results = async {
        let mut search = search_service().await;
        let mut results = Vec::new();
        let mut request = SearchPostsRequest {
            query: query.to_owned(),
            sort_by: None,
            page_params: Some(PageParams {
                limit: Some(200),
                ..Default::default()
            }),
            omit_labels: Vec::new(),
        };
        loop {
            let response = search
                .search_posts(request.clone())
                .await
                .unwrap()
                .into_inner();
            results.extend(response.results);

            if let Some(page_info) = response.page_info {
                if !page_info.has_next_page || page_info.end_cursor.is_empty() {
                    break;
                }
                request.page_params.get_or_insert_default().forward_token =
                    Some(page_info.end_cursor);
            } else {
                break;
            }
        }
        results
    }
    .await;
    eprintln!("expected: {expected:#?}");
    eprintln!("results: {results:#?}");

    for result in results {
        let event = result.event_bundle.unwrap();
        let Some(serialized_content) = event.serialized_content.as_ref() else {
            panic!("missing content in event: {event:?}");
        };
        let Ok(content) = Content::decode(&*serialized_content.content_bytes)
        else {
            panic!("failed to decode event: {event:?}");
        };
        let Some(ContentBody::Post(post)) = content.content_body else {
            panic!("unexpected content body: {event:?}");
        };
        // Hard to assert the actual rank, so just check we have it.
        assert!(result.rank >= 0.0);

        let Some(idx) = expected.iter().position(|e| e.text == post.text)
        else {
            continue;
        };
        let expected = expected.remove(idx);
        assert_eq!(post, expected);
    }

    assert!(expected.is_empty(), "missing expected posts: {expected:?}");
}

async fn expect_searched_posts2<F, Fut>(
    request: SearchPostsRequest,
    expected: Vec<Post>,
    get_results: F,
) where
    F: FnOnce(SearchPostsRequest) -> Fut,
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
        let Some(ContentBody::Post(post)) = content.content_body else {
            panic!("unexpected content body: {event:?}");
        };
        assert_eq!(post, expected);
        // Hard to assert the actual rank, so just check we have it.
        assert!(result.rank >= 0.0);
    }
}
