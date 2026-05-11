import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNpms } from "@/services/npmsClient";
import {
  getAllNpmsPestCandidates,
  getNpmsPestDetail,
  getNpmsPestImageCandidates,
  getNpmsPestCandidateSources,
  getNpmsPestCandidates,
  getNpmsPhotoDiagnosisReferences,
} from "@/services/npmsPestService";

vi.mock("@/services/npmsClient", () => ({
  fetchNpms: vi.fn(),
}));

const fetchNpmsMock = vi.mocked(fetchNpms);

describe("NCPMS pest service", () => {
  beforeEach(() => {
    fetchNpmsMock.mockReset();
  });

  it("fetches every SVC16 page for dashboard disease and insect candidates", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: { totalCount: "5", startPoint: "1", displayCount: "3" },
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "Disease 1",
            detailUrl: "serviceCode=SVC05&sickKey=D1",
          },
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "Disease 2",
            detailUrl: "serviceCode=SVC05&sickKey=D2",
          },
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "Disease 3",
            detailUrl: "serviceCode=SVC05&sickKey=D3",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: { totalCount: "4", startPoint: "1", displayCount: "3" },
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP03",
            divName: "해충",
            korName: "Insect 1",
            detailUrl: "serviceCode=SVC07&insectKey=I1",
          },
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP03",
            divName: "해충",
            korName: "Insect 2",
            detailUrl: "serviceCode=SVC07&insectKey=I2",
          },
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP03",
            divName: "해충",
            korName: "Insect 3",
            detailUrl: "serviceCode=SVC07&insectKey=I3",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: { totalCount: "5", startPoint: "4", displayCount: "3" },
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "Disease 4",
            detailUrl: "serviceCode=SVC05&sickKey=D4",
          },
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "Disease 5",
            detailUrl: "serviceCode=SVC05&sickKey=D5",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: { totalCount: "4", startPoint: "4", displayCount: "3" },
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP03",
            divName: "해충",
            korName: "Insect 4",
            detailUrl: "serviceCode=SVC07&insectKey=I4",
          },
        ],
      });

    const result = await getAllNpmsPestCandidates("토마토");

    expect(result.totalCount).toBe(9);
    expect(result.candidates.map((candidate) => candidate.name)).toEqual([
      "Disease 1",
      "Disease 2",
      "Disease 3",
      "Disease 4",
      "Disease 5",
      "Insect 1",
      "Insect 2",
      "Insect 3",
      "Insect 4",
    ]);
    expect(fetchNpmsMock).toHaveBeenCalledWith("SVC16", expect.objectContaining({
      divCode: "NP01",
      startPoint: 4,
    }));
    expect(fetchNpmsMock).toHaveBeenCalledWith("SVC16", expect.objectContaining({
      divCode: "NP03",
      startPoint: 4,
    }));
  });

  it("uses the first SVC16 page only when totalCount metadata is missing", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "Duplicate disease",
            detailUrl: "serviceCode=SVC05&sickKey=D1",
          },
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "Duplicate disease",
            detailUrl: "serviceCode=SVC05&sickKey=D1",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [],
      });

    const result = await getAllNpmsPestCandidates("토마토");

    expect(result.totalCount).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(fetchNpmsMock).toHaveBeenCalledTimes(2);
  });

  it("uses SVC16 crop-code searches for tomato disease and insect candidates", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "궤양병",
            detailUrl: "apiKey=secret&serviceCode=SVC05&sickKey=D00004102&serviceType=AA003",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP03",
            divName: "해충",
            korName: "담배가루이",
            detailUrl: "apiKey=secret&serviceCode=SVC07&insectKey=H00000304&serviceType=AA003",
          },
        ],
      });

    const candidates = await getNpmsPestCandidates("토마토");

    expect(fetchNpmsMock).toHaveBeenNthCalledWith(1, "SVC16", {
      serviceType: "AA003",
      cropCode: "VC010803",
      divCode: "NP01",
      displayCount: 10,
      startPoint: 1,
    });
    expect(fetchNpmsMock).toHaveBeenNthCalledWith(2, "SVC16", {
      serviceType: "AA003",
      cropCode: "VC010803",
      divCode: "NP03",
      displayCount: 10,
      startPoint: 1,
    });
    expect(candidates).toEqual([
      expect.objectContaining({
        cropName: "토마토",
        name: "궤양병",
        detailServiceCode: "SVC05",
        detailKey: "D00004102",
      }),
      expect.objectContaining({
        cropName: "토마토",
        name: "담배가루이",
        detailServiceCode: "SVC07",
        detailKey: "H00000304",
      }),
    ]);
  });

  it("resolves unmapped crop names through NCPMS before disease and insect lookup", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC999001",
            cropName: "상추",
            divCode: "NP01",
            divName: "병",
            korName: "균핵병",
            detailUrl: "serviceCode=SVC05&sickKey=D00000001",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC999001",
            cropName: "상추",
            divCode: "NP01",
            divName: "병",
            korName: "균핵병",
            detailUrl: "serviceCode=SVC05&sickKey=D00000001",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC999001",
            cropName: "상추",
            divCode: "NP03",
            divName: "해충",
            korName: "목화진딧물",
            detailUrl: "serviceCode=SVC07&insectKey=H00000001",
          },
        ],
      });

    const candidates = await getNpmsPestCandidates("상추");

    expect(fetchNpmsMock).toHaveBeenNthCalledWith(1, "SVC16", {
      serviceType: "AA003",
      cropName: "상추",
      displayCount: 20,
      startPoint: 1,
    });
    expect(fetchNpmsMock).toHaveBeenNthCalledWith(2, "SVC16", expect.objectContaining({
      cropCode: "VC999001",
      divCode: "NP01",
    }));
    expect(fetchNpmsMock).toHaveBeenNthCalledWith(3, "SVC16", expect.objectContaining({
      cropCode: "VC999001",
      divCode: "NP03",
    }));
    expect(candidates.map((candidate) => candidate.name)).toEqual(["균핵병", "목화진딧물"]);
  });

  it("falls back to NCPMS searchName when cropName lookup has no crop match", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC999002",
            cropName: "청경채",
            divCode: "NP01",
            divName: "병",
            korName: "무름병",
            detailUrl: "serviceCode=SVC05&sickKey=D00000002",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC999002",
            cropName: "청경채",
            divCode: "NP01",
            divName: "병",
            korName: "무름병",
            detailUrl: "serviceCode=SVC05&sickKey=D00000002",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [],
      });

    const candidates = await getNpmsPestCandidates("청경채");

    expect(fetchNpmsMock).toHaveBeenNthCalledWith(1, "SVC16", expect.objectContaining({
      cropName: "청경채",
    }));
    expect(fetchNpmsMock).toHaveBeenNthCalledWith(2, "SVC16", expect.objectContaining({
      searchName: "청경채",
    }));
    expect(fetchNpmsMock).toHaveBeenNthCalledWith(3, "SVC16", expect.objectContaining({
      cropCode: "VC999002",
      divCode: "NP01",
    }));
    expect(candidates.map((candidate) => candidate.name)).toEqual(["무름병"]);
  });

  it("formats NCPMS candidates as scoring sources without leaking API keys", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "FC010101",
            cropName: "논벼",
            divCode: "NP01",
            divName: "병",
            korName: "이삭도열병",
            detailUrl: "apiKey=secret&serviceCode=SVC05&sickKey=D00000815",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [],
      });

    const sources = await getNpmsPestCandidateSources("논");

    expect(sources).toEqual([
      {
        type: "npms",
        title: "논벼 병: 이삭도열병",
        url: null,
      },
    ]);
    expect(JSON.stringify(sources)).not.toContain("secret");
  });

  it("uses SVC13 image search for crop-specific photo diagnosis candidates", async () => {
    fetchNpmsMock.mockResolvedValueOnce({
      source: "npms",
      serviceCode: "SVC13",
      fetchedAt: "2026-05-07T09:00:00.000Z",
      data: {},
      service: {},
      items: [
        {
          pestName: "궤양병",
          category: "병생태",
          pestKey: "D00004102",
          thumbImg: "https://ncpms.rda.go.kr/example.jpg",
        },
      ],
    });

    const candidates = await getNpmsPestImageCandidates("토마토");

    expect(fetchNpmsMock).toHaveBeenCalledWith("SVC13", {
      serviceType: "AA003",
      cropCode: "VC010803",
      displayCount: 20,
      startPoint: 1,
    });
    expect(candidates).toEqual([
      expect.objectContaining({
        cropName: "토마토",
        name: "궤양병",
        category: "병생태",
        detailServiceCode: "SVC05",
        detailKey: "D00004102",
      }),
    ]);
  });

  it("loads disease detail content and images with SVC05", async () => {
    fetchNpmsMock.mockResolvedValueOnce({
      source: "npms",
      serviceCode: "SVC05",
      fetchedAt: "2026-05-07T09:00:00.000Z",
      data: {},
      service: {
        cropName: "Tomato",
        sickNameKor: "Bacterial canker",
        sickNameEng: "Bacterial canker",
        symptoms: "Leaf spots<br/>Stem canker",
        preventionMethod: "Use clean seed.",
        imageList: [
          {
            image: "https://ncpms.rda.go.kr/disease.jpg",
            imageTitle: "Disease symptom",
            iemSpchcknNm: "Symptom",
          },
        ],
      },
      items: [],
    });

    const detail = await getNpmsPestDetail({
      kind: "disease",
      name: "Bacterial canker",
      detailServiceCode: "SVC05",
      detailKey: "D00004102",
    });

    expect(fetchNpmsMock).toHaveBeenCalledWith("SVC05", {
      serviceType: "AA003",
      sickKey: "D00004102",
    });
    expect(detail).toEqual(
      expect.objectContaining({
        kind: "disease",
        name: "Bacterial canker",
        cropName: "Tomato",
        scientificName: "Bacterial canker",
        sections: expect.arrayContaining([
          { title: "병 증상", content: "Leaf spots\nStem canker" },
          { title: "방제방법", content: "Use clean seed." },
        ]),
        images: [
          {
            url: "https://ncpms.rda.go.kr/disease.jpg",
            title: "Disease symptom",
            category: "Symptom",
          },
        ],
      }),
    );
  });

  it("builds photo diagnosis references from SVC13 first and fills with deduped SVC16 candidates", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC13",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            pestName: "궤양병",
            category: "병생태",
            pestKey: "D00004102",
            thumbImg: "https://ncpms.rda.go.kr/canker.jpg",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP01",
            divName: "병",
            korName: "궤양병",
            detailUrl: "serviceCode=SVC05&sickKey=D00004102",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC16",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            cropCode: "VC010803",
            cropName: "토마토",
            divCode: "NP03",
            divName: "해충",
            korName: "온실가루이",
            detailUrl: "serviceCode=SVC07&insectKey=H00000304",
          },
        ],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC05",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {
          cropName: "토마토",
          sickNameKor: "궤양병",
          symptoms: "잎 반점<br/>줄기 궤양",
          imageList: [
            {
              image: "https://ncpms.rda.go.kr/canker-detail.jpg",
              imageTitle: "궤양병 세부 증상",
              iemSpchcknNm: "증상",
            },
          ],
        },
        items: [],
      })
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC07",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {
          cropName: "토마토",
          insectSpeciesKor: "온실가루이",
          damageInfo: "잎 뒷면 흡즙 피해",
        },
        items: [],
      });

    const references = await getNpmsPhotoDiagnosisReferences("토마토", 2);

    expect(fetchNpmsMock).toHaveBeenNthCalledWith(1, "SVC13", {
      serviceType: "AA003",
      cropCode: "VC010803",
      displayCount: 2,
      startPoint: 1,
    });
    expect(references).toEqual([
      expect.objectContaining({
        id: "VC010803:SVC05:D00004102",
        name: "궤양병",
        kind: "disease",
        category: "병생태",
        sections: [{ title: "병 증상", content: "잎 반점\n줄기 궤양" }],
        images: [
          {
            url: "https://ncpms.rda.go.kr/canker-detail.jpg",
            title: "궤양병 세부 증상",
            category: "증상",
          },
        ],
      }),
      expect.objectContaining({
        id: "VC010803:SVC07:H00000304",
        name: "온실가루이",
        kind: "insect",
        category: "해충",
        sections: [{ title: "피해정보", content: "잎 뒷면 흡즙 피해" }],
      }),
    ]);
  });

  it("keeps photo diagnosis references when detail loading fails", async () => {
    fetchNpmsMock
      .mockResolvedValueOnce({
        source: "npms",
        serviceCode: "SVC13",
        fetchedAt: "2026-05-07T09:00:00.000Z",
        data: {},
        service: {},
        items: [
          {
            pestName: "궤양병",
            category: "병생태",
            pestKey: "D00004102",
          },
        ],
      })
      .mockRejectedValueOnce(new Error("detail failed"));

    const references = await getNpmsPhotoDiagnosisReferences("토마토", 1);

    expect(references).toEqual([
      expect.objectContaining({
        id: "VC010803:SVC05:D00004102",
        name: "궤양병",
        sections: [],
      }),
    ]);
  });
});
