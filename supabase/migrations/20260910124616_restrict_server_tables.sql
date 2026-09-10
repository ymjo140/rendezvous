-- API-owned tables audited against both rendezvous and rendezvous-merchant.
-- Merchant browser tables (places, menus, offers catalog, reservations, etc.) retain their policies.
-- No row changes. The table owner / server role retains access.
DO $$
DECLARE table_name TEXT; client_role TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['action_logs', 'avatar_items', 'campaigns', 'chat_poll_options', 'chat_poll_votes', 'chat_polls', 'chat_room_members', 'chat_rooms', 'chat_split_requests', 'chat_split_shares', 'coin_history', 'communities', 'community_follows', 'content_reports', 'crew_partnership_apps', 'crew_partnerships', 'events', 'friendships', 'list_comments', 'list_likes', 'list_saves', 'meeting_histories', 'meeting_logs', 'merchant_customer_memos', 'merchant_reengage', 'messages', 'offers', 'partnership_redemptions', 'place_checkins', 'place_embedding_meta', 'place_embeddings', 'place_vectors', 'place_visit_feedback', 'post_comments', 'post_likes', 'post_saves', 'posts', 'recommendation_logs', 'recommendation_results', 'reviews', 'save_folders', 'saved_items', 'share_carts', 'shared_messages', 'similar_places', 'taste_space', 'travel_time_cache', 'user_actions', 'user_avatars', 'user_badges', 'user_blocks', 'user_embeddings', 'user_follows', 'user_interaction_logs', 'user_preference_vectors', 'user_push_tokens', 'user_step_logs', 'user_verifications', 'users', 'visit_approval_requests', 'visit_events', 'visit_logs', 'visit_participants', 'votes'] LOOP
    IF to_regclass(quote_ident(current_schema()) || '.' || quote_ident(table_name)) IS NOT NULL THEN
      EXECUTE 'ALTER TABLE ' || quote_ident(table_name) || ' ENABLE ROW LEVEL SECURITY';
      FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
          EXECUTE 'REVOKE ALL ON TABLE ' || quote_ident(table_name) || ' FROM ' || quote_ident(client_role);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
