export default function MapSkeleton() {
  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
      <div className="text-center animate-pulse">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 mx-auto mb-2" />
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Planning route…</p>
      </div>
    </div>
  );
}
