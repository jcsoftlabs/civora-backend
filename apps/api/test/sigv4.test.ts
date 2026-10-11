// Signature SigV4 : exemple officiel d'URL présignée de la documentation AWS S3
// (« Authenticating Requests: Using Query Parameters »).
import { describe, expect, it } from "vitest";
import { presignUrl, uriEncode } from "../src/lib/storage/sigv4.js";

describe("SigV4", () => {
  it("reproduit la signature de l'exemple officiel AWS", () => {
    const url = presignUrl(
      {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
      },
      {
        method: "GET",
        host: "examplebucket.s3.amazonaws.com",
        path: "/test.txt",
        expiresSeconds: 86400,
        now: new Date("2013-05-24T00:00:00Z"),
      },
    );
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z" +
        "&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
        "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("encode selon la RFC 3986", () => {
    expect(uriEncode("a b/c(d)*!'", true)).toBe("a%20b/c%28d%29%2A%21%27");
    expect(uriEncode("a/b")).toBe("a%2Fb");
  });
});
