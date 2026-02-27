from server.routers.ws import _is_disconnected_runtime_error


def test_is_disconnected_runtime_error_true():
    exc = RuntimeError('WebSocket is not connected. Need to call "accept" first.')
    assert _is_disconnected_runtime_error(exc) is True


def test_is_disconnected_runtime_error_false():
    assert _is_disconnected_runtime_error(RuntimeError("different runtime error")) is False
