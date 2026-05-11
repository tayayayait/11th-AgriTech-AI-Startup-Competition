import { describe, expect, it } from "vitest";
import { getFarmmapExternalScriptUrls, getFarmmapSdkProxyRequest } from "@/services/farmmapSdk";

describe("farmmap SDK loader", () => {
  it("loads required vendor scripts before the proxied SDK", () => {
    expect(getFarmmapExternalScriptUrls()).toEqual([
      "https://agis.epis.or.kr/ASD/pub2/js/jquery-3.4.1.js",
      "https://agis.epis.or.kr/ASD/js/lib/openlayers/OpenLayers.js",
      "https://agis.epis.or.kr/ASD/js/lib/proj4js/proj4.js",
    ]);
  });

  it("uses the Farmmap proxy operation for the SDK script", () => {
    expect(getFarmmapSdkProxyRequest()).toEqual({ operation: "sdkScript" });
  });
});
