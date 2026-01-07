"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, CheckCircle, XCircle } from "lucide-react"
import { formatDateISO } from "@/lib/utils"
import type { mockData } from "@/lib/mock-data"

interface RequestApprovalModalProps {
  request: (typeof mockData.stockRequests)[0]
  onApprove: () => void
  onReject: (reason: string) => void
  onClose: () => void
}

export default function RequestApprovalModal({ request, onApprove, onReject, onClose }: RequestApprovalModalProps) {
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectForm, setShowRejectForm] = useState(false)

  const handleRejectSubmit = () => {
    if (rejectionReason.trim()) {
      onReject(rejectionReason)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-lg w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Review Request</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition flex-shrink-0 ml-2">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {!showRejectForm ? (
          <div className="space-y-4 mb-6">
            <div className="bg-slate-700/50 p-4 rounded-lg space-y-3">
              <div>
                <p className="text-slate-400 text-sm">Product</p>
                <p className="text-white font-semibold text-lg">{request.productName}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Quantity Requested</p>
                <p className="text-cyan-400 font-bold text-2xl">{request.quantity} units</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Model</p>
                <p className="text-white">{request.model}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Requested By</p>
                <p className="text-white">{request.adminName}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Request Date</p>
                <p className="text-white">{formatDateISO(request.requestedDate || request.created_at)}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={onApprove}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </Button>
              <Button
                onClick={() => setShowRejectForm(true)}
                variant="outline"
                className="flex-1 border-red-600 text-red-400 hover:bg-red-950"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <p className="text-slate-300">Please provide a reason for rejection:</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none h-28"
              placeholder="e.g., Insufficient stock, Items on backorder, etc."
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => {
                  setShowRejectForm(false)
                  setRejectionReason("")
                }}
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectSubmit}
                disabled={!rejectionReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                Submit Rejection
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}