"""
API Integration Tests

Tests the REST API endpoints using FastAPI TestClient.
"""

import pytest
from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


class TestRecordingAPI:
    """Test Recording REST API endpoints"""

    def test_health_check(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_start_recording(self):
        """Test starting a recording via API"""
        payload = {
            "session_id": "test_session_123",
            "participant_id": "test_user_456",
            "media_type": "audio"
        }

        response = client.post("/api/recordings/start", json=payload)
        assert response.status_code == 201

        data = response.json()
        assert "recording_id" in data
        assert data["session_id"] == "test_session_123"
        assert data["status"] == "recording"

    def test_stop_recording(self):
        """Test stopping a recording via API"""
        # First start a recording
        start_payload = {
            "session_id": "test_session_123",
            "participant_id": "test_user_456",
            "media_type": "audio"
        }

        start_response = client.post("/api/recordings/start", json=start_payload)
        recording_id = start_response.json()["recording_id"]

        # Stop the recording
        stop_response = client.post(f"/api/recordings/{recording_id}/stop")
        assert stop_response.status_code == 200

        data = stop_response.json()
        assert data["status"] == "stopped"

    def test_get_recording_status(self):
        """Test getting recording status via API"""
        # Start a recording
        start_payload = {
            "session_id": "test_session_123",
            "participant_id": "test_user_456"
        }

        start_response = client.post("/api/recordings/start", json=start_payload)
        recording_id = start_response.json()["recording_id"]

        # Get status
        status_response = client.get(f"/api/recordings/{recording_id}/status")
        assert status_response.status_code == 200

        data = status_response.json()
        assert data["recording_id"] == recording_id
        assert "status" in data
        assert "duration_seconds" in data


class TestUploadAPI:
    """Test Upload REST API endpoints"""

    def test_initiate_upload(self):
        """Test initiating an upload via API"""
        # First create a recording
        start_payload = {
            "session_id": "test_session_123",
            "participant_id": "test_user_456"
        }

        start_response = client.post("/api/recordings/start", json=start_payload)
        recording_id = start_response.json()["recording_id"]

        # Initiate upload
        upload_payload = {
            "recording_id": recording_id,
            "session_id": "test_session_123",
            "file_name": "test_recording.webm",
            "mime_type": "audio/webm",
            "total_chunks": 10
        }

        upload_response = client.post("/api/uploads/initiate", json=upload_payload)
        assert upload_response.status_code == 201

        data = upload_response.json()
        assert "upload_id" in data
        assert data["recording_id"] == recording_id
        assert data["total_chunks"] == 10


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
