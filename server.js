const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Gemini API 키: 환경변수 또는 하드코딩
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY"; 
// ⚠️ 여기에 주인님 키 직접 넣지 말고 환경변수로 쓰는 걸 강력추천!

// 업로드 메모리 저장
const upload = multer({ storage: multer.memoryStorage() });

// CORS & JSON
app.use(cors());
app.use(express.json());

// 정적 파일 제공
app.use(express.static(path.join(__dirname, "public")));

// 결과 저장 파일
const SUBMISSION_FILE = path.join(__dirname, "submissions.json");

// 초기화
async function initStorage() {
  if (!(await fs.pathExists(SUBMISSION_FILE))) {
    await fs.writeJson(SUBMISSION_FILE, []);
  }
}
initStorage();

// 🔹 Gemini API 호출 함수
async function gradeWithGemini({ nickname, answers, images }) {
  // 🔹 채점 기준 (조금 더 빡세게)
  const rubric = `
You are a strict semiconductor teacher.
You will grade 3 short-answer questions about semiconductor concepts.

You MUST follow these rules strictly:
- Score each question from 0 to 100.
- If an answer is clearly off-topic, random text, or meaningless characters (e.g. "asdfasdf", "ㅋㅋㅋㅋ"), you MUST give that question a score of 0.
- If an answer is extremely short (for example less than 10 Korean characters or less than 5 English words) and does not contain any relevant technical content, you MUST give that question a score of 0.
- Do not be generous. Only give scores above 0 when the student shows some understanding of the semiconductor concept.
- If the student confuses concepts completely, heavily penalize the score.

You MUST return ONLY a raw JSON object, with NO markdown, NO code fences, NO extra text.
The JSON format must be exactly:

{
  "scores": [number, number, number],
  "feedback": "overall feedback in Korean, 3~5 sentences",
  "per_question_feedback": [
    "feedback for Q1 in Korean",
    "feedback for Q2 in Korean",
    "feedback for Q3 in Korean"
  ]
}

Question 1: FEOL과 BEOL의 차이와, 왜 고온 공정은 FEOL에서만 가능한지 설명하라.
핵심 포인트:
- FEOL: 트랜지스터/소자 형성, Si/SiO2/Poly, 고온 공정 가능(산화, 어닐링 등)
- BEOL: 금속 배선/비아/절연막, Cu/Al/Low-k, 고온 불가(금속 확산/융해, 유기 절연막 손상)

Question 2: DRAM 셀이 어떻게 0과 1을 저장하고, 왜 리프레시(Refresh)가 필요한지 설명하라.
핵심 포인트:
- 1T1C 구조, 커패시터에 전하 유무로 0/1 저장
- 누설 전류로 전하가 사라지므로 주기적 리프레시 필요
- 워드라인/비트라인/센스 앰프 개념 언급 시 가점

Question 3: 반도체 수율(Yield)이 무엇인지, 왜 중요한지, 낮아지는 주된 이유를 2가지 이상 설명하라.
핵심 포인트:
- 수율 = 전체 칩 중 양품 비율
- 생산 단가와 직결
- 파티클, 공정 불균일, 장비 드리프트, 설계 문제 등이 원인
`;

  const baseText = `
Nickname: ${nickname}

Answers:
Q1: ${answers[0] || ""}
Q2: ${answers[1] || ""}
Q3: ${answers[2] || ""}

If images are provided, you may use them only as supplementary context, but grading should be based mainly on the text answers.
`;

  // 🔹 Gemini API에 보낼 parts 구성 (텍스트 + 이미지)
  const parts = [
    { text: rubric },
    { text: baseText }
  ];

  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimetype,
        data: img.buffer.toString("base64")
      }
    });
  }

  // ✅ 공식 REST 엔드포인트 형식
  const url =
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;


      const response = await axios.post(
        url,
        {
          contents: [
            {
              role: "user",
              parts
            }
          ]
        },
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    
      let text =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
      // 🔹 1차: 양쪽 공백 제거
      let cleaned = text.trim();
    
      // 🔹 2차: ```json ... ``` 코드블록 제거
      if (cleaned.startsWith("```")) {
        // 첫 줄( ``` 또는 ```json ) 제거
        const firstNewline = cleaned.indexOf("\n");
        if (firstNewline !== -1) {
          cleaned = cleaned.slice(firstNewline + 1);
        }
        // 마지막 ``` 제거
        const lastFence = cleaned.lastIndexOf("```");
        if (lastFence !== -1) {
          cleaned = cleaned.slice(0, lastFence);
        }
        cleaned = cleaned.trim();
      }
    
      let parsed;
    
      try {
        // 🔹 3차: 그대로 JSON 파싱 시도
        parsed = JSON.parse(cleaned);
      } catch (e1) {
        // 🔹 4차: 혹시 중간에 다른 문자가 섞여 있으면 { ... } 부분만 추출해서 재시도
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
          try {
            parsed = JSON.parse(jsonSlice);
          } catch (e2) {
            console.error("JSON parse error from Gemini (2nd try):", cleaned);
            // 🔹 완전 실패 시: 그래도 Gemini 원문을 그대로 프론트에 넘겨주기
            parsed = {
              scores: [0, 0, 0],
              feedback:
                "JSON 파싱에 실패했습니다. 아래는 Gemini의 원본 응답입니다:\n\n" +
                text,
              per_question_feedback: [
                "원본 응답을 직접 확인해주세요.",
                "",
                ""
              ]
            };
          }
        } else {
          console.error("JSON parse error from Gemini (no braces):", cleaned);
          parsed = {
            scores: [0, 0, 0],
            feedback:
              "JSON 파싱에 실패했습니다. 아래는 Gemini의 원본 응답입니다:\n\n" +
              text,
            per_question_feedback: [
              "원본 응답을 직접 확인해주세요.",
              "",
              ""
            ]
          };
        }
      }
    
      if (!Array.isArray(parsed.scores) || parsed.scores.length !== 3) {
        parsed.scores = [0, 0, 0];
      }
    
      return parsed;
    }

// 🔹 채점 API (답안 + 이미지 업로드)
app.post("/api/grade", upload.array("images", 3), async (req, res) => {
  try {
    const { nickname, answers } = req.body;
    const parsedAnswers = JSON.parse(answers || "[]");
    const images = req.files || [];

    const result = await gradeWithGemini({
      nickname,
      answers: parsedAnswers,
      images
    });

    const submission = {
      id: Date.now(),
      nickname,
      answers: parsedAnswers,
      scores: result.scores,
      feedback: result.feedback,
      perQuestionFeedback: result.per_question_feedback || [],
      createdAt: new Date().toISOString()
    };

    const list = await fs.readJson(SUBMISSION_FILE);
    list.push(submission);
    await fs.writeJson(SUBMISSION_FILE, list, { spaces: 2 });

    res.json(submission);
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: "채점 중 오류가 발생했습니다." });
  }
});

// 🔹 전체 결과 조회 (대시보드용, 누구나 볼 수 있음)
app.get("/api/results", async (req, res) => {
  try {
    const list = await fs.readJson(SUBMISSION_FILE);
    res.json(list.sort((a, b) => b.id - a.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "결과 조회 중 오류가 발생했습니다." });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
