// 1. Add canvas to table row:
<td class="py-4 text-right">
    <canvas id="spark-yourasset" class="sparkline-container"></canvas>
</td>

// 2. Add data:
sparklineData.yourasset: [100, 105, 102, 110, 108, 115, 120, 118]

// 3. Render in function:
createSparkline('spark-yourasset', sparklineData.yourasset, true);