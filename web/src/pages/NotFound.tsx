import { useNavigate } from "react-router-dom";
import { NoticeFrame } from "../components/common/NoticeFrame";
import { StatusNotice } from "../components/common/StatusNotice";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <NoticeFrame>
      <StatusNotice
        title="Page not found"
        actions={
          <>
            <button
              onClick={() => navigate("/")}
              className="btn btn-primary flex-1 py-2"
            >
              Home
            </button>
            <button
              onClick={() => navigate("/play")}
              className="btn btn-secondary flex-1 py-2"
            >
              Play
            </button>
          </>
        }
      >
        There&apos;s nothing at this address. It may have been mistyped or
        moved.
      </StatusNotice>
    </NoticeFrame>
  );
}
