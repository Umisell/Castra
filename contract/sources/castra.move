module castra_addr::castra_pro {
    use std::signer;
    use std::string::String;
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::timestamp;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;

    struct UserProfile has key, store {
        addr: address,
        timestamp: u64,
        is_active: bool,
        is_premium: bool,
    }

    struct SocialBalance has key {
        amount: u64,
    }

    struct CastPermission has copy, drop, store {
        cast_id: String,
        blob_name: String,
        visibility: u8,
        allowlist: vector<address>,
        unlock_at_secs: u64,
        price_octas: u64,
        created_at: u64,
    }

    struct CastRegistry has key {
        casts: vector<CastPermission>,
    }

    struct Events has key {
        activity_events: EventHandle<ActivityEvent>,
    }

    struct ActivityEvent has drop, store {
        user: address,
        action: String,
        timestamp: u64,
    }

    const VISIBILITY_PUBLIC: u8 = 0;
    const VISIBILITY_PREMIUM: u8 = 1;
    const VISIBILITY_PRIVATE: u8 = 2;
    const VISIBILITY_ALLOWLIST: u8 = 3;
    const VISIBILITY_TIMELOCK: u8 = 4;
    const VISIBILITY_PURCHASABLE: u8 = 5;

    public entry fun register_user(account: &signer) acquires Events {
        let addr = signer::address_of(account);
        
        if (!exists<Events>(addr)) {
            move_to(account, Events {
                activity_events: account::new_event_handle<ActivityEvent>(account),
            });
        };

        if (!exists<UserProfile>(addr)) {
            move_to(account, UserProfile {
                addr,
                timestamp: timestamp::now_seconds(),
                is_active: true,
                is_premium: true,
            });

            let events = borrow_global_mut<Events>(addr);
            event::emit_event(&mut events.activity_events, ActivityEvent {
                user: addr,
                action: std::string::utf8(b"REGISTER"),
                timestamp: timestamp::now_seconds(),
            });
        };
    }

    public entry fun publish_cast_permission(
        account: &signer,
        cast_id: String,
        blob_name: String,
        visibility: u8,
        allowlist: vector<address>,
        unlock_at_secs: u64,
        price_octas: u64,
    ) acquires CastRegistry, Events {
        let addr = signer::address_of(account);

        if (!exists<CastRegistry>(addr)) {
            move_to(account, CastRegistry { casts: vector::empty<CastPermission>() });
        };

        if (!exists<Events>(addr)) {
            move_to(account, Events {
                activity_events: account::new_event_handle<ActivityEvent>(account),
            });
        };

        let registry = borrow_global_mut<CastRegistry>(addr);
        vector::push_back(&mut registry.casts, CastPermission {
            cast_id,
            blob_name,
            visibility,
            allowlist,
            unlock_at_secs,
            price_octas,
            created_at: timestamp::now_seconds(),
        });

        let events = borrow_global_mut<Events>(addr);
        event::emit_event(&mut events.activity_events, ActivityEvent {
            user: addr,
            action: std::string::utf8(b"PUBLISH_CAST_PERMISSION"),
            timestamp: timestamp::now_seconds(),
        });
    }

    public entry fun publish_cast_permissions(
        account: &signer,
        cast_id: String,
        blob_names: vector<String>,
        visibility: u8,
        allowlist: vector<address>,
        unlock_at_secs: u64,
        price_octas: u64,
    ) acquires CastRegistry, Events {
        let addr = signer::address_of(account);

        if (!exists<CastRegistry>(addr)) {
            move_to(account, CastRegistry { casts: vector::empty<CastPermission>() });
        };

        if (!exists<Events>(addr)) {
            move_to(account, Events {
                activity_events: account::new_event_handle<ActivityEvent>(account),
            });
        };

        let registry = borrow_global_mut<CastRegistry>(addr);
        let len = vector::length(&blob_names);
        let i = 0;
        let now = timestamp::now_seconds();

        while (i < len) {
            let blob_name = *vector::borrow(&blob_names, i);
            vector::push_back(&mut registry.casts, CastPermission {
                cast_id,
                blob_name,
                visibility,
                allowlist,
                unlock_at_secs,
                price_octas,
                created_at: now,
            });
            i = i + 1;
        };

        let events = borrow_global_mut<Events>(addr);
        event::emit_event(&mut events.activity_events, ActivityEvent {
            user: addr,
            action: std::string::utf8(b"PUBLISH_CAST_PERMISSIONS"),
            timestamp: now,
        });
    }

    #[view]
    public fun can_read_cast(owner: address, viewer: address, cast_id: String): bool acquires CastRegistry, UserProfile {
        if (!exists<CastRegistry>(owner)) {
            return false
        };

        let registry = borrow_global<CastRegistry>(owner);
        let len = vector::length(&registry.casts);
        let i = 0;

        while (i < len) {
            let item = vector::borrow(&registry.casts, i);
            if (item.cast_id == cast_id) {
                return can_read_permission(owner, viewer, item)
            };
            i = i + 1;
        };

        false
    }

    #[view]
    public fun can_read_blob(owner: address, viewer: address, blob_name: String): bool acquires CastRegistry, UserProfile {
        if (!exists<CastRegistry>(owner)) {
            return false
        };

        let registry = borrow_global<CastRegistry>(owner);
        let len = vector::length(&registry.casts);
        let i = 0;

        while (i < len) {
            let item = vector::borrow(&registry.casts, i);
            if (item.blob_name == blob_name) {
                return can_read_permission(owner, viewer, item)
            };
            i = i + 1;
        };

        false
    }

    fun can_read_permission(owner: address, viewer: address, permission: &CastPermission): bool acquires UserProfile {
        if (owner == viewer) {
            return true
        };

        if (permission.visibility == VISIBILITY_PUBLIC) {
            return true
        };

        if (permission.visibility == VISIBILITY_PRIVATE) {
            return false
        };

        if (permission.visibility == VISIBILITY_PREMIUM) {
            return exists<UserProfile>(viewer) && borrow_global<UserProfile>(viewer).is_premium
        };

        if (permission.visibility == VISIBILITY_ALLOWLIST) {
            return vector::contains(&permission.allowlist, &viewer)
        };

        if (permission.visibility == VISIBILITY_TIMELOCK) {
            return timestamp::now_seconds() >= permission.unlock_at_secs
        };

        if (permission.visibility == VISIBILITY_PURCHASABLE) {
            return false
        };

        false
    }

    public entry fun mint_social_token(account: &signer) acquires Events, SocialBalance {
        let addr = signer::address_of(account);
        
        if (!exists<Events>(addr)) {
            move_to(account, Events {
                activity_events: account::new_event_handle<ActivityEvent>(account),
            });
        };

        if (!exists<SocialBalance>(addr)) {
            move_to(account, SocialBalance { amount: 100 });
        } else {
            let balance = borrow_global_mut<SocialBalance>(addr);
            balance.amount = balance.amount + 100;
        };

        let events = borrow_global_mut<Events>(addr);
        event::emit_event(&mut events.activity_events, ActivityEvent {
            user: addr,
            action: std::string::utf8(b"MINT_SOCIAL_TOKEN"),
            timestamp: timestamp::now_seconds(),
        });
    }

    public entry fun like_cast(account: &signer, _cast_id: String) acquires Events {
        let addr = signer::address_of(account);
        if (exists<Events>(addr)) {
            let events = borrow_global_mut<Events>(addr);
            event::emit_event(&mut events.activity_events, ActivityEvent {
                user: addr,
                action: std::string::utf8(b"LIKE_CAST"),
                timestamp: timestamp::now_seconds(),
            });
        };
    }

    public entry fun upgrade_to_premium(account: &signer) acquires Events, UserProfile {
        let addr = signer::address_of(account);
        let fee = 10000000;
        
        coin::transfer<AptosCoin>(account, @castra_addr, fee);

        if (!exists<UserProfile>(addr)) {
            move_to(account, UserProfile {
                addr,
                timestamp: timestamp::now_seconds(),
                is_active: true,
                is_premium: true,
            });
        } else {
            let profile = borrow_global_mut<UserProfile>(addr);
            profile.is_premium = true;
        };

        if (exists<Events>(addr)) {
            let events = borrow_global_mut<Events>(addr);
            event::emit_event(&mut events.activity_events, ActivityEvent {
                user: addr,
                action: std::string::utf8(b"UPGRADE_PREMIUM"),
                timestamp: timestamp::now_seconds(),
            });
        };
    }

    public entry fun protocol_heartbeat(account: &signer) acquires Events {
        let addr = signer::address_of(account);
        if (exists<Events>(addr)) {
            let events = borrow_global_mut<Events>(addr);
            event::emit_event(&mut events.activity_events, ActivityEvent {
                user: addr,
                action: std::string::utf8(b"HEARTBEAT"),
                timestamp: timestamp::now_seconds(),
            });
        };
    }
}
