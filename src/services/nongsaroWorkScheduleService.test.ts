import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NongsaroApiResponse } from "@/services/nongsaroClient";

vi.mock("@/services/nongsaroClient", () => ({
  fetchNongsaro: vi.fn(),
}));

import { fetchNongsaro } from "@/services/nongsaroClient";
import {
  getWorkScheduleLookupForCrop,
  getWorkSchedulesForCrop,
} from "@/services/nongsaroWorkScheduleService";

const nongsaroResponse = (items: Array<Record<string, string>>): NongsaroApiResponse =>
  ({
    source: "nongsaro",
    serviceName: "farmWorkingPlanNew",
    operationName: "mock",
    fetchedAt: "2026-05-07T00:00:00.000Z",
    data: {} as NongsaroApiResponse["data"],
    items,
    resultCode: "00",
    resultMsg: "OK",
  }) as NongsaroApiResponse;

describe("nongsaro work schedule service", () => {
  const fetchNongsaroMock = vi.mocked(fetchNongsaro);

  beforeEach(() => {
    fetchNongsaroMock.mockReset();
  });

  it("loads structured era schedule JSON for a matched crop work schedule", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "workScheduleGrpList") {
        return nongsaroResponse([
          {
            codeNm: "rice",
            kidofcomdtySeCode: "RICE",
            sort: "1",
          },
        ]);
      }

      if (operationName === "workScheduleLst") {
        expect(params).toEqual({ kidofcomdtySeCode: "RICE" });
        return nongsaroResponse([
          {
            cntntsNo: "30697",
            cntntsSj: "rice machine transplanting",
            fileName: "rice-schedule.pdf",
            fileDownUrlInfo: "http://api.nongsaro.go.kr/file/rice-schedule.pdf",
          },
        ]);
      }

      if (operationName === "workScheduleEraInfoJsonLst") {
        expect(params).toEqual({ cntntsNo: "30697" });
        return nongsaroResponse([
          {
            opertNm: "seed soaking",
            farmWorkFlag: "machine transplanting",
            beginMon: "4",
            endMon: "5",
            beginEra: "upper",
            endEra: "middle",
            reqreMonth: "1",
            infoSeCodeNm: "main work",
            vodUrl: "https://example.test/video",
          },
        ]);
      }

      if (operationName === "workScheduleEraInfoLst") {
        return nongsaroResponse([{ htmlCn: "<p>era detail</p>" }]);
      }

      if (operationName === "workScheduleDtl") {
        return nongsaroResponse([{ cn: "<p>detail</p>" }]);
      }

      throw new Error(`Unexpected operation: ${operationName}`);
    });

    const schedules = await getWorkSchedulesForCrop("rice");

    expect(fetchNongsaroMock).toHaveBeenCalledWith("farmWorkingPlanNew", "workScheduleEraInfoJsonLst", {
      cntntsNo: "30697",
    });
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      sourceId: "30697",
      title: "rice machine transplanting",
      cropName: "rice",
      groupCode: "RICE",
      detailText: "detail",
      fileName: "rice-schedule.pdf",
      fileUrl: "http://api.nongsaro.go.kr/file/rice-schedule.pdf",
      eras: [
        {
          operationName: "seed soaking",
          farmWorkFlag: "machine transplanting",
          beginMonth: 4,
          endMonth: 5,
          beginEra: "upper",
          endEra: "middle",
          requiredMonth: 1,
          infoType: "main work",
          videoUrl: "https://example.test/video",
        },
      ],
    });
  });

  it("keeps only schedules whose title matches the selected crop inside a broad crop group", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "workScheduleGrpList") {
        return nongsaroResponse([
          {
            codeNm: "과수",
            kidofcomdtySeCode: "FRUIT",
            sort: "1",
          },
        ]);
      }

      if (operationName === "workScheduleLst") {
        expect(params).toEqual({ kidofcomdtySeCode: "FRUIT" });
        return nongsaroResponse([
          {
            cntntsNo: "100",
            cntntsSj: "감귤(노지재배)",
          },
          {
            cntntsNo: "101",
            cntntsSj: "단감",
          },
          {
            cntntsNo: "102",
            cntntsSj: "포도(무가온)",
          },
          {
            cntntsNo: "103",
            cntntsSj: "포도(표준가온)",
          },
        ]);
      }

      if (operationName === "workScheduleEraInfoJsonLst") {
        expect(["102", "103"]).toContain(params?.cntntsNo);
        return nongsaroResponse([
          {
            opertNm: params?.cntntsNo === "102" ? "꽃송이 다듬기" : "온도 관리",
            farmWorkFlag: params?.cntntsNo === "102" ? "무가온" : "표준가온",
            beginMon: "5",
            endMon: "5",
            beginEra: "상",
            endEra: "중",
            vodUrl: params?.cntntsNo === "102" ? "https://example.test/grape-cold" : "https://example.test/grape-heated",
          },
        ]);
      }

      if (operationName === "workScheduleEraInfoLst") {
        expect(["102", "103"]).toContain(params?.cntntsNo);
        return nongsaroResponse([]);
      }

      if (operationName === "workScheduleDtl") {
        expect(["102", "103"]).toContain(params?.cntntsNo);
        return nongsaroResponse([]);
      }

      throw new Error(`Unexpected operation: ${operationName}`);
    });

    const schedules = await getWorkSchedulesForCrop("포도");

    expect(schedules.map((schedule) => schedule.title)).toEqual(["포도(무가온)", "포도(표준가온)"]);
    expect(schedules.flatMap((schedule) => schedule.eras.map((era) => era.farmWorkFlag))).toEqual(["무가온", "표준가온"]);
    expect(schedules.flatMap((schedule) => schedule.eras.map((era) => era.videoUrl))).toEqual([
      "https://example.test/grape-cold",
      "https://example.test/grape-heated",
    ]);
    expect(fetchNongsaroMock).not.toHaveBeenCalledWith(
      "farmWorkingPlanNew",
      "workScheduleEraInfoJsonLst",
      { cntntsNo: "100" },
    );
    expect(fetchNongsaroMock).not.toHaveBeenCalledWith(
      "farmWorkingPlanNew",
      "workScheduleEraInfoJsonLst",
      { cntntsNo: "101" },
    );
  });

  it("finds peach schedules from the fruit group and exposes lookup status", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "workScheduleGrpList") {
        return nongsaroResponse([
          { codeNm: "채소", kidofcomdtySeCode: "210001", sort: "5" },
          { codeNm: "과수", kidofcomdtySeCode: "210002", sort: "6" },
        ]);
      }

      if (operationName === "workScheduleLst") {
        expect(params).toEqual({ kidofcomdtySeCode: "210002" });
        return nongsaroResponse([
          { cntntsNo: "30661", sj: "배", fileName: "배 농작업일정.hwpx" },
          { cntntsNo: "30662", sj: "복숭아", fileName: "복숭아 농작업일정.hwpx" },
          { cntntsNo: "30663", sj: "사과", fileName: "사과.hwp" },
        ]);
      }

      if (operationName === "workScheduleDtl") {
        expect(params).toEqual({ cntntsNo: "30662" });
        return nongsaroResponse([{ cn: "<p>복숭아 상세</p>" }]);
      }

      if (operationName === "workScheduleEraInfoJsonLst") {
        expect(params).toEqual({ cntntsNo: "30662" });
        return nongsaroResponse([
          {
            opertNm: "봉오리따기&lt;br/&gt;꽃솎기,열매솎기",
            farmWorkFlag: "열매맺음 조절",
            beginMon: "4",
            beginEra: "상",
            endMon: "5",
            endEra: "하",
            infoSeCodeNm: "생육과정(주요농작업)",
          },
        ]);
      }

      throw new Error(`Unexpected operation: ${operationName}`);
    });

    const lookup = await getWorkScheduleLookupForCrop("복숭아");

    expect(lookup.status).toBe("schedule-found");
    expect(lookup.matchedGroup).toMatchObject({ cropName: "과수", groupCode: "210002" });
    expect(lookup.allScheduleCount).toBe(3);
    expect(lookup.matchedScheduleCount).toBe(1);
    expect(lookup.schedules[0]).toMatchObject({
      sourceId: "30662",
      title: "복숭아",
      cropName: "과수",
      groupCode: "210002",
      detailText: "복숭아 상세",
      fileName: "복숭아 농작업일정.hwpx",
      eras: [
        expect.objectContaining({
          operationName: "봉오리따기\n꽃솎기,열매솎기",
          beginMonth: 4,
          endMonth: 5,
          beginEra: "상",
          endEra: "하",
        }),
      ],
    });
  });

  it("distinguishes successful API lookup with no crop title match", async () => {
    fetchNongsaroMock.mockImplementation(async (_serviceName, operationName, params) => {
      if (operationName === "workScheduleGrpList") {
        return nongsaroResponse([{ codeNm: "과수", kidofcomdtySeCode: "210002", sort: "6" }]);
      }

      if (operationName === "workScheduleLst") {
        expect(params).toEqual({ kidofcomdtySeCode: "210002" });
        return nongsaroResponse([
          { cntntsNo: "30661", sj: "배" },
          { cntntsNo: "30663", sj: "사과" },
        ]);
      }

      throw new Error(`Unexpected operation: ${operationName}`);
    });

    const lookup = await getWorkScheduleLookupForCrop("복숭아");

    expect(lookup.status).toBe("schedule-match-failed");
    expect(lookup.allScheduleCount).toBe(2);
    expect(lookup.matchedScheduleCount).toBe(0);
    expect(lookup.schedules).toEqual([]);
  });
});
