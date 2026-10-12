from datetime import timedelta

from app.database import SessionLocal, utcnow
from app.models import Message
from app.services.messages import purge_expired

from .conftest import register


def _send(client, user, conversation_id, body, client_id, **extra):
    return client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"client_id": client_id, "body": body, **extra},
        headers=user["headers"],
    )


def _direct(client, a, b):
    res = client.post("/api/conversations/direct", json={"user_id": b["id"]}, headers=a["headers"])
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _receive_until(ws, event_type, limit=20):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame["type"] == event_type:
            return frame
    raise AssertionError(f"no {event_type} event received")


# ---------- auth ----------


def test_register_login_logout(client):
    res = client.post("/api/auth/request-code", json={"phone": "+1 (555) 123-4567"})
    assert res.json() == {"phone": "+15551234567", "is_registered": False, "mock_code": "123456"}

    bad = client.post("/api/auth/verify", json={"phone": "+15551234567", "code": "000000"})
    assert bad.status_code == 400

    ok = client.post("/api/auth/verify", json={"phone": "+15551234567", "code": "123456"}).json()
    assert ok["is_new_user"] is True
    headers = {"Authorization": f"Bearer {ok['token']}"}

    me = client.patch("/api/users/me", json={"display_name": "Ada"}, headers=headers).json()
    assert me["is_profile_complete"] is True

    again = client.post("/api/auth/verify", json={"phone": "+15551234567", "code": "123456"}).json()
    assert again["is_new_user"] is False and again["user"]["id"] == me["id"]

    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_invalid_phone_rejected(client):
    assert client.post("/api/auth/request-code", json={"phone": "12"}).status_code == 422


def test_username_must_be_unique(client):
    register(client, "+15550000001", "A", "ada")
    b = register(client, "+15550000002", "B")
    res = client.patch("/api/users/me", json={"username": "ada"}, headers=b["headers"])
    assert res.status_code == 409


# ---------- contacts ----------


def test_add_contact_by_phone_and_username(client):
    a = register(client, "+15550000001", "Ada")
    register(client, "+15550000002", "Bob", "bob")
    register(client, "+15550000003", "Cy")

    assert client.post("/api/contacts", json={"username": "@bob"}, headers=a["headers"]).status_code == 201
    assert client.post("/api/contacts", json={"phone": "+15550000003"}, headers=a["headers"]).status_code == 201
    # Idempotent.
    assert client.post("/api/contacts", json={"username": "bob"}, headers=a["headers"]).status_code == 200
    assert client.post("/api/contacts", json={"phone": "+15559999999"}, headers=a["headers"]).status_code == 404
    assert client.post("/api/contacts", json={"phone": "+15550000001"}, headers=a["headers"]).status_code == 400

    names = [u["display_name"] for u in client.get("/api/contacts", headers=a["headers"]).json()]
    assert names == ["Bob", "Cy"]


# ---------- direct messaging ----------


def test_direct_chat_is_unique_per_pair(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    assert _direct(client, a, b) == _direct(client, b, a)


def test_send_is_idempotent_and_validated(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    cid = _direct(client, a, b)

    first = _send(client, a, cid, "hello", "c1")
    retry = _send(client, a, cid, "hello", "c1")
    assert first.status_code == 201 and retry.status_code == 200
    assert first.json()["id"] == retry.json()["id"]
    assert first.json()["status"] == "sent"

    assert _send(client, a, cid, "   ", "c2").status_code == 422
    outsider = register(client, "+15550000003", "Eve")
    assert _send(client, outsider, cid, "hi", "c3").status_code == 404


def test_receipts_unread_and_read_flow(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    cid = _direct(client, a, b)
    mid = _send(client, a, cid, "hi", "c1").json()["id"]

    convs = client.get("/api/conversations", headers=b["headers"]).json()
    assert convs[0]["unread_count"] == 1
    assert convs[0]["last_message"]["body"] == "hi"

    # Fetching history marks delivered.
    client.get(f"/api/conversations/{cid}/messages", headers=b["headers"])
    msgs = client.get(f"/api/conversations/{cid}/messages", headers=a["headers"]).json()["messages"]
    assert msgs[-1]["status"] == "delivered"

    assert client.post(f"/api/conversations/{cid}/read", json={}, headers=b["headers"]).status_code == 204
    msgs = client.get(f"/api/conversations/{cid}/messages", headers=a["headers"]).json()["messages"]
    assert msgs[-1]["status"] == "read"
    assert client.get("/api/conversations", headers=b["headers"]).json()[0]["unread_count"] == 0

    info = client.get(f"/api/messages/{mid}/info", headers=a["headers"]).json()
    assert info["recipients"][0]["read_at"] is not None
    assert client.get(f"/api/messages/{mid}/info", headers=b["headers"]).status_code == 403


def test_pagination(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    cid = _direct(client, a, b)
    for i in range(5):
        _send(client, a, cid, f"m{i}", f"c{i}")
    page = client.get(f"/api/conversations/{cid}/messages?limit=3", headers=a["headers"]).json()
    assert [m["body"] for m in page["messages"]] == ["m2", "m3", "m4"] and page["has_more"]
    older = client.get(
        f"/api/conversations/{cid}/messages?limit=3&before_id={page['messages'][0]['id']}",
        headers=a["headers"],
    ).json()
    assert [m["body"] for m in older["messages"]] == ["m0", "m1"] and not older["has_more"]


def test_reply_and_reactions(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    cid = _direct(client, a, b)
    first = _send(client, a, cid, "question?", "c1").json()
    reply = _send(client, b, cid, "answer", "c2", reply_to_id=first["id"]).json()
    assert reply["reply_to"]["body"] == "question?"

    r = client.put(f"/api/messages/{first['id']}/reaction", json={"emoji": "👍"}, headers=b["headers"])
    assert r.json()["reactions"] == [{"user_id": b["id"], "emoji": "👍"}]
    r = client.put(f"/api/messages/{first['id']}/reaction", json={"emoji": "❤️"}, headers=b["headers"])
    assert r.json()["reactions"] == [{"user_id": b["id"], "emoji": "❤️"}]
    r = client.delete(f"/api/messages/{first['id']}/reaction", headers=b["headers"])
    assert r.json()["reactions"] == []


def test_attachment_upload_and_send(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    cid = _direct(client, a, b)
    up = client.post(
        "/api/attachments",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
        headers=a["headers"],
    ).json()
    msg = _send(client, a, cid, "", "c1", attachment_id=up["id"]).json()
    assert msg["attachment"]["file_name"] == "notes.txt"
    dl = client.get(msg["attachment"]["url"])
    assert dl.status_code == 200 and dl.content == b"hello world"
    assert "attachment" in dl.headers["content-disposition"]


def test_disappearing_messages_expire(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    cid = _direct(client, a, b)
    conv = client.patch(f"/api/conversations/{cid}", json={"disappearing_seconds": 30}, headers=a["headers"])
    assert conv.json()["disappearing_seconds"] == 30
    msg = _send(client, a, cid, "secret", "c1").json()
    assert msg["expires_at"] is not None

    with SessionLocal() as db:
        db.get(Message, msg["id"]).expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
        purged = purge_expired(db)
    assert [p[1] for p in purged] == [msg["id"]]
    bodies = [m["body"] for m in client.get(f"/api/conversations/{cid}/messages", headers=a["headers"]).json()["messages"]]
    assert "secret" not in bodies


# ---------- groups ----------


def test_group_admin_controls(client):
    admin = register(client, "+15550000001", "Ada")
    bob = register(client, "+15550000002", "Bob")
    cy = register(client, "+15550000003", "Cy")
    dee = register(client, "+15550000004", "Dee")

    res = client.post(
        "/api/conversations/group", json={"title": "Team", "member_ids": [bob["id"], cy["id"]]}, headers=admin["headers"]
    )
    assert res.status_code == 201
    group = res.json()
    gid = group["id"]
    assert group["my_role"] == "admin" and len(group["members"]) == 3

    # Members can't administer.
    assert client.post(f"/api/conversations/{gid}/members", json={"user_ids": [dee["id"]]}, headers=bob["headers"]).status_code == 403
    assert client.delete(f"/api/conversations/{gid}/members/{cy['id']}", headers=bob["headers"]).status_code == 403

    added = client.post(f"/api/conversations/{gid}/members", json={"user_ids": [dee["id"]]}, headers=admin["headers"])
    assert len(added.json()["members"]) == 4
    assert client.delete(f"/api/conversations/{gid}/members/{cy['id']}", headers=admin["headers"]).status_code == 204
    assert client.get(f"/api/conversations/{gid}", headers=cy["headers"]).status_code == 404

    # Group messaging reaches members, and read status requires everyone.
    mid = _send(client, admin, gid, "hello team", "g1").json()["id"]
    for u in (bob, dee):
        client.post(f"/api/conversations/{gid}/read", json={}, headers=u["headers"])
    msgs = client.get(f"/api/conversations/{gid}/messages", headers=admin["headers"]).json()["messages"]
    assert next(m for m in msgs if m["id"] == mid)["status"] == "read"
    events = [m["meta"]["event"] for m in msgs if m["kind"] == "system"]
    assert events == ["group_created", "members_added", "member_removed"]

    # Last admin leaving promotes someone else.
    assert client.patch(f"/api/conversations/{gid}/members/{admin['id']}", json={"role": "member"}, headers=admin["headers"]).status_code == 400
    assert client.delete(f"/api/conversations/{gid}/members/{admin['id']}", headers=admin["headers"]).status_code == 204
    roles = {m["user"]["id"]: m["role"] for m in client.get(f"/api/conversations/{gid}", headers=bob["headers"]).json()["members"]}
    assert admin["id"] not in roles and "admin" in roles.values()


def test_search(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bobby Tables")
    client.post("/api/contacts", json={"phone": "+15550000002"}, headers=a["headers"])
    cid = _direct(client, a, b)
    _send(client, b, cid, "Lunch at noon?", "c1")
    res = client.get("/api/search", params={"q": "bobby"}, headers=a["headers"]).json()
    assert res["contacts"][0]["id"] == b["id"] and res["conversations"] == [cid]
    res = client.get("/api/search", params={"q": "LUNCH"}, headers=a["headers"]).json()
    assert res["messages"][0]["message"]["body"] == "Lunch at noon?"
    assert client.get("/api/search", params={"q": "100%_"}, headers=a["headers"]).json()["messages"] == []


# ---------- realtime ----------


def test_websocket_realtime_flow(client):
    a = register(client, "+15550000001", "Ada")
    b = register(client, "+15550000002", "Bob")
    cid = _direct(client, a, b)

    with client.websocket_connect(f"/ws?token={a['token']}") as ws_a:
        assert ws_a.receive_json()["type"] == "hello"
        with client.websocket_connect(f"/ws?token={b['token']}") as ws_b:
            assert ws_b.receive_json()["type"] == "hello"
            presence = _receive_until(ws_a, "presence")
            assert presence["data"] == {"user_id": b["id"], "online": True, "last_seen_at": None}

            # Typing is relayed to the other member only.
            ws_a.send_json({"type": "typing", "conversation_id": cid, "is_typing": True})
            typing = _receive_until(ws_b, "typing")
            assert typing["data"]["user_id"] == a["id"] and typing["data"]["is_typing"]

            # A sent message is pushed to the recipient...
            mid = _send(client, a, cid, "realtime!", "c1").json()["id"]
            created = _receive_until(ws_b, "message.created")
            assert created["data"]["body"] == "realtime!" and created["data"]["status"] is None

            # ...the recipient acks delivery, and the sender sees the tick change.
            ws_b.send_json({"type": "delivered", "message_ids": [mid]})
            status = _receive_until(ws_a, "message.status")
            assert status["data"]["updates"][0] == {"message_id": mid, "conversation_id": cid, "status": "delivered"}

            client.post(f"/api/conversations/{cid}/read", json={}, headers=b["headers"])
            status = _receive_until(ws_a, "message.status")
            assert status["data"]["updates"][0]["status"] == "read"

        offline = _receive_until(ws_a, "presence")
        assert offline["data"]["online"] is False and offline["data"]["last_seen_at"]


def test_websocket_rejects_bad_token(client):
    with client.websocket_connect("/ws?token=nope") as ws:
        try:
            ws.receive_json()
            raise AssertionError("socket should be closed")
        except Exception as exc:  # WebSocketDisconnect
            assert getattr(exc, "code", None) == 4401
