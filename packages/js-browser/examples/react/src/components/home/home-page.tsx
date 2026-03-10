import { useContext } from "react";
import { ClientContext } from "../../main";
import { GenericFeed } from "../feeds/generic-feed";
import { IdentitySelector } from "../identities/identity-selector";
import { PostCompose } from "../posts/post-compose";
import { ServerSelector } from "../settings/servers";

export const HomePage = () => {
  const client = useContext(ClientContext);

  if(!client) {
    return <div>Error: no client object provided</div>;
  }

  return (
    <div>
      <div>{/*Feed goes here*/}</div>
      {<IdentitySelector></IdentitySelector>}
      <ServerSelector></ServerSelector>
      <PostCompose></PostCompose>
      <h1>Explore Feed</h1>
      <GenericFeed query={client.queryExploreFeed()}></GenericFeed>
      <h1>Following Feed</h1>
      <GenericFeed query={client.queryFollowingFeed(20)}></GenericFeed>
      <h1>Likes Feed</h1>
      <GenericFeed query={client.queryLikesFeed(20)}></GenericFeed>
      <h1>Comments Feed</h1>
      <GenericFeed query={client.queryCommentsFeed()}></GenericFeed>
    </div>
  );
};
