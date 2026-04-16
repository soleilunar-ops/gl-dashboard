/**
 * 로컬 개발 시 `npm run dev`와 함께 promotion_dashboard의 Dash(8050)를 기동한다.
 * Windows/macOS/Linux 공통으로 sibling 폴더를 cwd로 두고 python app.py를 실행한다.
 */
const { spawn } = require("child_process");
const path = require("path");

const dashRoot = path.resolve(__dirname, "..", "..", "promotion_dashboard");
const isWin = process.platform === "win32";
const pythonCmd = process.env.PYTHON || (isWin ? "python" : "python3");

const child = spawn(pythonCmd, ["app.py"], {
  cwd: dashRoot,
  stdio: "inherit",
  env: { ...process.env },
  shell: isWin,
});

child.on("error", (err) => {
  console.error("[promotion-dash]", err.message);
  console.error(
    "[promotion-dash] Python 또는 promotion_dashboard 경로를 확인하세요. PYTHON 환경변수로 실행 파일을 지정할 수 있습니다."
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
