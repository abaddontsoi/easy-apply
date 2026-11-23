import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as logout } from "../../src/app/api/auth/logout/route";
import { POST as signup } from "../../src/app/api/auth/signup/route";
import { GET as listLetters } from "../../src/app/api/letters/route";
import {
  USER_A,
  installAuth,
  installDesk,
  jsonRequest,
  readPayload,
  configureTestEnv,
  installTestEnv,
} from "./harness";

installTestEnv();

describe("auth routes", { concurrency: 1 }, () => {
  it("rejects login and signup when Supabase is not configured", async () => {
    const loginResponse = await login(jsonRequest("http://127.0.0.1/api/auth/login", credentials()));
    assert.equal(loginResponse.status, 503);
    assert.match(String((await readPayload(loginResponse)).error), /尚未設定/);

    const signupResponse = await signup(jsonRequest("http://127.0.0.1/api/auth/signup", credentials()));
    assert.equal(signupResponse.status, 503);
  });

  it("rejects a bad email, a short password, and a body that is not JSON", async () => {
    configureTestEnv();
    installDesk([USER_A]);
    const badEmail = await login(
      jsonRequest("http://127.0.0.1/api/auth/login", { email: "not-an-email", password: "password-ok" }),
    );
    assert.equal(badEmail.status, 400);

    const shortPassword = await signup(
      jsonRequest("http://127.0.0.1/api/auth/signup", { email: "new@example.com", password: "short" }),
    );
    assert.equal(shortPassword.status, 400);

    const broken = await login(
      new Request("http://127.0.0.1/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    assert.equal(broken.status, 400);
  });

  it("rejects a wrong password and signs in with a normalized email", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    desk.signInAs(null);
    const rejected = await login(
      jsonRequest("http://127.0.0.1/api/auth/login", { email: USER_A.email, password: "wrong-password" }),
    );
    assert.equal(rejected.status, 401);
    assert.match(String((await readPayload(rejected)).error), /不正確/);

    const accepted = await login(
      jsonRequest("http://127.0.0.1/api/auth/login", { email: "A@Example.com", password: "password-ok" }),
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get("cache-control"), "private, no-store");
    assert.equal((await readPayload(accepted)).email, USER_A.email);

    const letters = await listLetters();
    assert.equal(letters.status, 200);
  });

  it("creates an account, reports confirmation, and reports a rejected signup", async () => {
    configureTestEnv();
    installDesk([USER_A]);
    const created = await signup(
      jsonRequest("http://127.0.0.1/api/auth/signup", { email: "new@example.com", password: "password-ok" }),
    );
    assert.equal(created.status, 200);
    const createdBody = await readPayload(created);
    assert.equal(createdBody.email, "new@example.com");
    assert.equal(createdBody.needsConfirmation, false);

    configureTestEnv();
    installAuth({
      auth: {
        async getUser() {
          return { data: { user: null }, error: { message: "no session" } };
        },
        async signInWithPassword() {
          return { data: { user: null, session: null }, error: { message: "no" } };
        },
        async signUp() {
          return { data: { user: { id: "user-new", email: "wait@example.com" }, session: null }, error: null };
        },
        async signOut() {
          return { error: null };
        },
      },
    });
    const waiting = await signup(
      jsonRequest("http://127.0.0.1/api/auth/signup", { email: "wait@example.com", password: "password-ok" }),
    );
    assert.equal(waiting.status, 200);
    assert.equal((await readPayload(waiting)).needsConfirmation, true);

    installAuth({
      auth: {
        async getUser() {
          return { data: { user: null }, error: { message: "no session" } };
        },
        async signInWithPassword() {
          return { data: { user: null, session: null }, error: { message: "no" } };
        },
        async signUp() {
          return { data: { user: null, session: null }, error: { message: "exists" } };
        },
        async signOut() {
          return { error: null };
        },
      },
    });
    const rejected = await signup(
      jsonRequest("http://127.0.0.1/api/auth/signup", { email: "taken@example.com", password: "password-ok" }),
    );
    assert.equal(rejected.status, 400);
  });

  it("logs out without a client and clears the signed-in user", async () => {
    const open = await logout();
    assert.equal(open.status, 200);
    assert.deepEqual(await readPayload(open), { ok: true });

    configureTestEnv();
    installDesk([USER_A]);
    const signedOut = await logout();
    assert.equal(signedOut.status, 200);
    const letters = await listLetters();
    assert.equal(letters.status, 401);
  });
});

function credentials(): { email: string; password: string } {
  return { email: "a@example.com", password: "password-ok" };
}
