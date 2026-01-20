import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"

type FilterDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  purposeConfig: Record<string, any> | null
  selectedPurpose: string
  onSelectPurpose: (purpose: string) => void
  selectedFilters: Record<string, string[]>
  onToggleFilter: (key: string, value: string) => void
}

export const FilterDialog = ({
  isOpen,
  onOpenChange,
  purposeConfig,
  selectedPurpose,
  onSelectPurpose,
  selectedFilters,
  onToggleFilter,
}: FilterDialogProps) => {
  const currentFilters = purposeConfig ? purposeConfig[selectedPurpose] : null
  const purposeKeys = purposeConfig ? Object.keys(purposeConfig) : []

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md h-[70vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl">
        <DialogHeader className="px-6 pt-4 pb-2 bg-white border-b">
          <DialogTitle>Filter options</DialogTitle>
          <DialogDescription className="hidden">Select purpose and filters.</DialogDescription>
        </DialogHeader>

        <div className="px-4 py-3 bg-gray-50 border-b">
          <div className="text-xs font-bold text-gray-500 mb-2">Purpose</div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {purposeKeys.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading filters...
              </div>
            ) : (
              purposeKeys.map((purposeKey) => (
                <Button
                  key={purposeKey}
                  variant={selectedPurpose === purposeKey ? "default" : "outline"}
                  className={`rounded-full h-8 text-xs flex-shrink-0 ${
                    selectedPurpose === purposeKey ? "bg-[#7C3AED] text-white" : "text-gray-600"
                  }`}
                  onClick={() => onSelectPurpose(purposeKey)}
                >
                  {purposeConfig?.[purposeKey]?.label ?? purposeKey}
                </Button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {currentFilters && (
            <Tabs defaultValue={Object.keys(currentFilters.tabs)[0]} className="flex-1 flex flex-col">
              <div className="px-4 pt-2 border-b">
                <TabsList className="w-full grid grid-cols-2 h-auto p-1 bg-gray-100 rounded-lg">
                  {Object.keys(currentFilters.tabs).map((tabKey) => (
                    <TabsTrigger key={tabKey} value={tabKey} className="text-xs py-1.5">
                      {currentFilters.tabs[tabKey].label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {Object.entries(currentFilters.tabs).map(([tabKey, tabData]: any) => (
                  <TabsContent key={tabKey} value={tabKey} className="mt-0 h-full">
                    <div className="grid grid-cols-3 gap-2">
                      {tabData.options.map((opt: string) => (
                        <Button
                          key={opt}
                          variant={selectedFilters[tabKey]?.includes(opt) ? "default" : "outline"}
                          className={`h-auto py-2 px-1 text-xs break-keep ${
                            selectedFilters[tabKey]?.includes(opt)
                              ? "bg-purple-50 text-[#7C3AED] border-[#7C3AED]"
                              : "text-gray-600 border-gray-200"
                          }`}
                          onClick={() => onToggleFilter(tabKey, opt)}
                        >
                          {opt}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          )}
          {!currentFilters && (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Loading filters...
            </div>
          )}
        </div>
        <DialogFooter className="p-4 border-t bg-white">
          <Button className="w-full bg-[#7C3AED] hover:bg-purple-700 font-bold" onClick={() => onOpenChange(false)}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
