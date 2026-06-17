use polycentric_common::models::protos_v2::{
    ListNotificationsRequest, ListNotificationsResponse, PageInfo,
};
use tonic::Status;

pub async fn handle(
    _req: ListNotificationsRequest,
) -> Result<ListNotificationsResponse, Status> {
    Ok(ListNotificationsResponse {
        notifications: [].to_vec(),
        event_hints: [].to_vec(),
        page_info: Some(PageInfo {
            end_cursor: "".to_string(),
            has_next_page: false,
            has_previous_page: false,
            start_cursor: "".to_string(),
        }),
    })
}
