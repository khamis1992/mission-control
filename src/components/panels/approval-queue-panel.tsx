'use client';

import { useState, useEffect } from 'react';

interface ApprovalRequest {
  id: string;
  task_id: number;
  agent_id: string;
  payload: any;
  reason: string;
  created_at: number;
  expires_at: number;
  status: 'pending' | 'approved' | 'rejected';
  gate_name?: string;
}

const ApprovalQueuePanel: React.FC = () => {
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  
  useEffect(() => {
    fetchPendingRequests();
  }, []);
  
  const fetchPendingRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/approvals?status=pending');
      const data = await res.json();
      setPendingRequests(data.requests || []);
    } catch (error) {
      console.error('Failed to fetch pending approval requests:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleApprove = async (requestId: string) => {
    try {
      const res = await fetch(`/api/approvals/${requestId}/approve`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        await fetchPendingRequests();
        setSelectedRequest(null);
      }
    } catch (error) {
      console.error('Failed to approve request:', error);
    }
  };
  
  const handleReject = async (requestId: string, reason: string = 'Rejected by operator') => {
    try {
      const res = await fetch(`/api/approvals/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        await fetchPendingRequests();
        setSelectedRequest(null);
      }
    } catch (error) {
      console.error('Failed to reject request:', error);
    }
  };
  
  const formatTime = (timestamp: number): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-100">Approval Queue</h2>
        <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
          {pendingRequests.length} pending
        </span>
      </div>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-gray-400 animate-spin mb-4">⏳</div>
          <div className="text-gray-500">Loading approval requests...</div>
        </div>
      ) : pendingRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <div className="text-6xl mb-4">✅</div>
          <div className="text-xl">No pending approvals</div>
          <div className="text-sm mt-2">All requests have been processed</div>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingRequests.map(request => (
            <div key={request.id} className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-gray-600 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-sm text-gray-500">
                      Task #{request.task_id}
                    </div>
                    <div className="text-xs text-gray-600 bg-gray-900 px-2 py-1 rounded">
                      {request.agent_id}
                    </div>
                    <div className="text-xs text-blue-400">
                      {request.gate_name || 'default'}
                    </div>
                  </div>
                  <div className="text-gray-300 font-medium text-sm">
                    {request.reason || 'No reason provided'}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div className="mb-1">
                    Created: {formatTime(request.created_at)}
                  </div>
                  <div>
                    Expires: {formatTime(request.expires_at)}
                  </div>
                </div>
              </div>
              
              {request.payload && (
                <div className="bg-gray-900 rounded p-3 mb-4 overflow-x-auto max-h-32 overflow-y-auto">
                  <div className="text-sm text-gray-400 mb-2 font-medium">Action Required:</div>
                  <pre className="text-xs text-green-400 font-mono">
                    {JSON.stringify(request.payload, null, 2).substring(0, 500)}
                    {JSON.stringify(request.payload, null, 2).length > 500 ? '...' : ''}
                  </pre>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedRequest(request)}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                >
                  Details
                </button>
                <button
                  onClick={() => handleApprove(request.id)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(request.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-100">Approval Request Details</h3>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="text-gray-400 hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-2">Task ID</div>
                <div className="bg-gray-900 p-3 rounded font-mono text-lg">
                  {selectedRequest.task_id}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500 mb-2">Agent ID</div>
                <div className="bg-gray-900 p-3 rounded">
                  {selectedRequest.agent_id}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500 mb-2">Request Reason</div>
                <div className="bg-gray-900 p-3 rounded text-gray-300 min-h-16">
                  {selectedRequest.reason || 'No reason provided'}
                </div>
              </div>
              
              {selectedRequest.payload && (
                <div>
                  <div className="text-sm text-gray-500 mb-2">Payload</div>
                  <div className="bg-gray-900 p-3 rounded text-green-400 overflow-x-auto max-h-40">
                    <pre className="text-xs">
                      {JSON.stringify(selectedRequest.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-4 mt-6 pt-6 border-t border-gray-700">
              <button
                onClick={() => handleApprove(selectedRequest.id)}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
              >
                Approve Request
              </button>
              <button
                onClick={() => handleReject(selectedRequest.id)}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 font-medium"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalQueuePanel;
