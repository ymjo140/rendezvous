import test from "node:test"
import assert from "node:assert/strict"
import { legacyCrewRoute } from "../lib/legacy-crew-route.ts"
import { safeCheckinReturn } from "../lib/checkin-return.ts"

test("old crew invitations retain their destination and query", () => {
  assert.equal(legacyCrewRoute(["groups", "crew-1"], {invite:"1", via:["friend", "chat"]}), "/crew/crew-1?invite=1&via=friend&via=chat")
  assert.equal(legacyCrewRoute(["crew", "a/b"], {joined:"1"}), "/crew/a%2Fb?joined=1")
})
test("old routes cannot become protocol-relative external URLs", () => {
  for (const parts of [["", "evil.example"], ["//evil.example"], ["..", "", "evil.example"]]) {
    const route=legacyCrewRoute(parts,{})
    assert.equal(new URL(route,"https://rendezvous.example").origin,"https://rendezvous.example")
  }
})
test("check-in login preserves the selected crew and reservation", () => {
  assert.equal(safeCheckinReturn("/checkin/1?cid=crew-1&rid=reservation-1"),"/checkin/1?cid=crew-1&rid=reservation-1")
  assert.equal(safeCheckinReturn("/checkin/1"),"/checkin/1")
})
test("check-in login rejects injected destinations and proof tokens", () => {
  for (const path of ["//evil.example", "https://evil.example", "/checkin/1?next=https://evil.example", "/checkin/1#qr=secret", "/checkin/1?cid=a&cid=b", "/checkin/1?cid=%2F%2Fevil.example", "/checkin/1/../login"]) {
    assert.equal(safeCheckinReturn(path),null)
  }
})
