const API_BASE = ""; // 같은 서버에서 서비스하므로 상대 경로 사용

const nicknameModal = document.getElementById("nicknameModal");
const nicknameInput = document.getElementById("nicknameInput");
const saveNicknameBtn = document.getElementById("saveNicknameBtn");
const nicknameDisplay = document.getElementById("nicknameDisplay");
const changeNicknameBtn = document.getElementById("changeNicknameBtn");

const quizForm = document.getElementById("quizForm");
const statusText = document.getElementById("status");
const resultCard = document.getElementById("resultCard");
const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const score3El = document.getElementById("score3");
const scoreAvgEl = document.getElementById("scoreAvg");
const overallFeedbackEl = document.getElementById("overallFeedback");

const dashboardBody = document.getElementById("dashboardBody");
const refreshDashboardBtn = document.getElementById("refreshDashboard");

// 닉네임 로드/설정
function loadNickname() {
  const stored = localStorage.getItem("semicon_nickname");
  if (!stored) {
    nicknameModal.classList.remove("hidden");
  } else {
    nicknameDisplay.textContent = stored;
  }
}
function saveNickname() {
  const v = nicknameInput.value.trim();
  if (!v) {
    alert("대화명을 입력해주세요.");
    return;
  }
  localStorage.setItem("semicon_nickname", v);
  nicknameDisplay.textContent = v;
  nicknameModal.classList.add("hidden");
}
saveNicknameBtn.addEventListener("click", saveNickname);
changeNicknameBtn.addEventListener("click", () => {
  nicknameInput.value = localStorage.getItem("semicon_nickname") || "";
  nicknameModal.classList.remove("hidden");
});

// 제출 핸들러
quizForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nickname = localStorage.getItem("semicon_nickname") || "";
  if (!nickname) {
    alert("먼저 대화명을 설정해주세요.");
    nicknameModal.classList.remove("hidden");
    return;
  }

  const formData = new FormData();
  const q1 = quizForm.elements["q1"].value;
  const q2 = quizForm.elements["q2"].value;
  const q3 = quizForm.elements["q3"].value;

  formData.append("nickname", nickname);
  formData.append("answers", JSON.stringify([q1, q2, q3]));

  const files = quizForm.elements["images"].files;
  for (let i = 0; i < files.length && i < 3; i++) {
    formData.append("images", files[i]);
  }

  statusText.textContent = "Gemini가 채점 중입니다... ⏳";
  resultCard.classList.add("hidden");

  try {
    const res = await fetch(API_BASE + "/api/grade", {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      throw new Error("채점 요청 실패");
    }
    const data = await res.json();
    showResult(data);
    statusText.textContent = "채점이 완료되었습니다 ✅";
    await loadDashboard();
  } catch (err) {
    console.error(err);
    statusText.textContent = "채점 중 오류가 발생했습니다 ❌";
  }
});

function showResult(data) {
  const s = data.scores || [0, 0, 0];
  score1El.textContent = `${s[0]}점`;
  score2El.textContent = `${s[1]}점`;
  score3El.textContent = `${s[2]}점`;
  const avg = Math.round((s[0] + s[1] + s[2]) / 3);
  scoreAvgEl.textContent = `${avg}점`;
  overallFeedbackEl.textContent = data.feedback || "";
  resultCard.classList.remove("hidden");
}

// 대시보드 로딩
async function loadDashboard() {
  dashboardBody.innerHTML = "불러오는 중...";
  try {
    const res = await fetch(API_BASE + "/api/results");
    if (!res.ok) throw new Error("결과 로딩 실패");
    const list = await res.json();
    if (!list.length) {
      dashboardBody.innerHTML = "<p>아직 제출된 결과가 없습니다.</p>";
      return;
    }
    dashboardBody.innerHTML = "";
    list.forEach((item) => {
      const div = document.createElement("div");
      div.className = "result-item";
      const created = new Date(item.createdAt);
      const timeStr = created.toLocaleString("ko-KR", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
      const scores = item.scores || [0, 0, 0];
      const avg = Math.round(
        (scores[0] + scores[1] + scores[2]) / 3
      );

      div.innerHTML = `
        <div class="result-item-header">
          <span class="nickname">${item.nickname}</span>
          <div class="result-item-header-right">
            <span class="time">${timeStr}</span>
            <button class="delete-btn" data-id="${item.id}" title="삭제">×</button>
          </div>
        </div>
        <div class="result-item-scores">
          <span>Q1: ${scores[0]}점</span>
          <span>Q2: ${scores[1]}점</span>
          <span>Q3: ${scores[2]}점</span>
        </div>
        <div class="result-item-total">평균: ${avg}점</div>
        <div class="result-item-feedback">${item.feedback || ""}</div>
      `;
      dashboardBody.appendChild(div);
      
      // 삭제 버튼 이벤트 리스너 추가
      const deleteBtn = div.querySelector(".delete-btn");
      deleteBtn.addEventListener("click", async () => {
        if (!confirm("이 기록을 삭제하시겠습니까?")) {
          return;
        }
        try {
          const res = await fetch(API_BASE + `/api/results/${item.id}`, {
            method: "DELETE"
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "삭제 실패");
          }
          await loadDashboard();
        } catch (err) {
          console.error("삭제 오류:", err);
          alert("삭제 중 오류가 발생했습니다: " + err.message);
        }
      });
    });
  } catch (err) {
    console.error(err);
    dashboardBody.innerHTML = "<p>대시보드 로딩 중 오류가 발생했습니다.</p>";
  }
}

refreshDashboardBtn.addEventListener("click", loadDashboard);

// 초기 실행
loadNickname();
loadDashboard();
