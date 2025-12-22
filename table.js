const data = {};

function add_score(title, platform, suite, test, base_runs_replicates, new_runs_replicates) {
  if (!(title in data)) {
    data[title] = {};
  }
  const per_title = data[title];

  if (!(platform in per_title)) {
    per_title[platform] = {};
  }
  const per_platform = per_title[platform];
  if (!(suite in per_platform)) {
    per_platform[suite] = {};
  }
  const per_suite = per_platform[suite];
  if (!(test in per_suite)) {
    per_suite[test] = {
      "base": [],
      "new": [],
    };
  }
  const per_test = per_suite[test];
  per_test.base.push(...base_runs_replicates);
  per_test.new.push(...new_runs_replicates);
}

function mean(ns) {
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

function stdev(ns) {
  const m = mean(ns);
  return Math.sqrt(mean(ns.map(n => (n - m) ** 2)));
}

// treeherder/treeherder/webapp/api/perfcompare_utils.py
const STDDEV_DEFAULT_FACTOR = 0.15;
const T_VALUE_CARE_MIN = 3;
const T_VALUE_CONFIDENCE = 5;
function get_abs_ttest_value(control_values, test_values) {
  const length_control = control_values.length;
  const length_test = test_values.length;
  if (length_control == 0 || length_test == 0) {
    return 0;
  }
  const control_group_avg = mean(control_values);
  const test_group_avg = mean(test_values);
  let stddev_control = length_control > 1
      ? stdev(control_values)
      : STDDEV_DEFAULT_FACTOR * control_group_avg;
  let stddev_test = length_test > 1
      ? stdev(test_values)
      : STDDEV_DEFAULT_FACTOR * test_group_avg;
  try {
    if (length_control == 1) {
      stddev_control = (control_values[0] * stddev_test) / test_group_avg;
    } else if (length_test == 1) {
      stddev_test = (test_values[0] * stddev_control) / control_group_avg;
    }
  } catch {
    return 0;
  }
  let delta = test_group_avg - control_group_avg;
  const std_diff_err = Math.sqrt(
    (stddev_control * stddev_control) / length_control
      + (stddev_test * stddev_test) / length_test
  );
  let res;
  try {
    res = Math.abs(delta / std_diff_err);
  } catch {
    return 0;
  }
  return res;
}
function get_confidence_text(abs_tvalue) {
  if (abs_tvalue === 0) {
    return "";
  }
  if (abs_tvalue < T_VALUE_CARE_MIN) {
    return "Low";
  }
  if (abs_tvalue < T_VALUE_CONFIDENCE) {
    return "Medium";
  }
  return "High";
}
// ----

function get_value(per_test) {
  if (per_test.base.length == 0 ||
      per_test.new.length == 0) {
    return null;
  }

  const base_avg = mean(per_test.base);
  const new_avg = mean(per_test.new);
  const r = ((new_avg - base_avg) / base_avg);
  let delta_percentage = Math.round(r * 10000) / 100;

  const abs_tvalue = get_abs_ttest_value(per_test.base, per_test.new);
  const confidence_text = get_confidence_text(abs_tvalue);
  return {
    delta_percentage,
    confidence_text,
  };
}

function add_scores() {
  for (const [title, data] of perfs) {
    for (const x of data) {
      for (const vs of Object.values(x)) {
        for (const v of vs) {
          if ((!"new_runs_replicates" in v && "base_runs_replicates" in v)) {
            continue;
          }
          if (!("extra_options" in v)) {
            continue;
          }

          if (!v.extra_options.includes("warm")) {
            continue;
          }
          if (!v.lower_is_better) {
            continue;
          }

          add_score(title, v.platform, v.suite, v.test,
                    v.base_runs_replicates,
                    v.new_runs_replicates);
        }
      }
    }
  }
}

function draw_scores() {
  const nav = document.createElement("div");
  nav.classList.add("nav");
  document.body.append(nav);

  const main = document.createElement("main");
  document.body.append(main);

  const testNames = [
    "fcp",
    "fnbpaint",
    "largestContentfulPaint",

    "loadtime",

    "FirstVisualChange",
    "LastVisualChange",

    "SpeedIndex",
    "ContentfulSpeedIndex",
    "PerceptualSpeedIndex",

    "cpuTime",
  ];

  let firstTitle = true;
  for (const title of Object.keys(data)) {
    const per_title = data[title];

    if (!firstTitle) {
      const sep = document.createElement("div");
      sep.classList.add("sep");
      nav.append(sep);
    }
    firstTitle = false;

    for (const platform of Object.keys(per_title).sort()) {
      const per_platform = per_title[platform];

      const h2 = document.createElement("h2");
      h2.append(title + " - " + platform);
      main.append(h2);

      const button = document.createElement("button");
      button.append(platform[0]);
      button.addEventListener("click", () => {
        document.documentElement.scrollTop = h2.offsetTop - 40;
      });
      nav.append(button);

      const per_test_results = {};
      for (const test of testNames) {
        per_test_results[test] = {
          numHighImprovements: 0,
          numHighRegressions: 0,
        };
      }

      const table = document.createElement("table");
      {
        const thead = document.createElement("thead");
        table.append(thead);
        const tr = document.createElement("tr");
        thead.append(tr);

        tr.append(document.createElement("th"));

        for (const test of testNames) {
          const th = document.createElement("th");
          th.classList.add("test");
          let first = true;
          for (const p of test.split(/(?=[A-Z])/)) {
            if (!first) {
              th.append(document.createElement("br"));
            }
            th.append(p);
            first = false;
          }
          tr.append(th);
        }

        {
          const th = document.createElement("th");
          th.classList.add("suite-num-improvements");
          th.append("improvements");
          tr.append(th);
        }
        {
          const th = document.createElement("th");
          th.append("regressions");
          tr.append(th);
        }
      }

      const tbody = document.createElement("tbody");
      table.append(tbody);

      for (const suite of Object.keys(per_platform).sort()) {
        const per_suite = per_platform[suite];

        const tr = document.createElement("tr");
        tbody.append(tr);

        const th = document.createElement("th");
        th.classList.add("suite");
        th.append(suite);
        tr.append(th);

        let numHighImprovements = 0;
        let numHighRegressions = 0;

        for (const test of testNames) {
          const td = document.createElement("td");
          td.classList.add("delta");
          tr.append(td);

          if (!(test in per_suite)) {
            td.append("-");
            continue;
          }

          const per_test = per_suite[test];

          const v = get_value(per_test);
          if (!v) {
            td.append("-");
            continue;
          }

          if (v.delta_percentage > 0) {
            td.append("+" + v.delta_percentage + "%");
          } else {
            td.append(v.delta_percentage + "%");
          }

          switch (v.confidence_text) {
            case "High":
              if (v.delta_percentage > 0) {
                numHighRegressions++;
                per_test_results[test].numHighRegressions++;
              } else if (v.delta_percentage < 0) {
                numHighImprovements++;
                per_test_results[test].numHighImprovements++;
              }
              break;
            case "Medium":
              td.classList.add("c_med");
              break;
            case "Low":
              td.classList.add("c_low");
              break;
          }

          if (v.delta_percentage != 0) {
            let target;
            let ratio;
            if (v.delta_percentage > 0) {
              target = "var(--regression-background)";
              ratio = Math.min(100, 20 + Math.abs(v.delta_percentage) / 2);
            } else if (v.delta_percentage < 0) {
              target = "var(--improvement-background)";
              ratio = Math.min(100, 20 + Math.abs(v.delta_percentage));
            }
            td.style.backgroundColor = `color-mix(in lab, ${target} ${ratio}%, var(--page-background) ${100 - ratio}%)`;
          }
        }

        if (numHighImprovements > numHighRegressions) {
          if (numHighRegressions == 0) {
            th.style.backgroundColor = "var(--improvement-background)";
          } else {
            th.style.backgroundColor = "color-mix(in lab, var(--improvement-background) 50%, var(--page-background) 50%)";
          }
        } else if (numHighRegressions > 0) {
          th.style.backgroundColor = "var(--regression-background)";
        }

        {
          const td = document.createElement("td");
          td.classList.add("num");
          td.classList.add("suite-num-improvements");
          td.append(numHighImprovements);
          tr.append(td);
          if (numHighImprovements > numHighRegressions) {
            td.style.backgroundColor = "var(--improvement-background)";
          }
        }

        {
          const td = document.createElement("td");
          td.classList.add("num");
          td.append(numHighRegressions);
          tr.append(td);
          if (numHighImprovements < numHighRegressions) {
            td.style.backgroundColor = "var(--regression-background)";
          } else if (numHighRegressions > 0) {
            td.style.backgroundColor = "color-mix(in lab, var(--regression-background) 50%, var(--page-background) 50%)";
          }
        }
      }

      {
        const tfoot = document.createElement("tfoot");
        table.append(tfoot);

        {
          const tr = document.createElement("tr");
          tfoot.append(tr);

          const th = document.createElement("th");
          th.append("Improvements");
          tr.append(th);

          for (const test of testNames) {
            const td = document.createElement("td");
            td.classList.add("num");
            td.append(per_test_results[test].numHighImprovements);
            tr.append(td);

            if (per_test_results[test].numHighImprovements > per_test_results[test].numHighRegressions) {
              td.style.backgroundColor = "var(--improvement-background)";
            }
          }

          {
            const td = document.createElement("td");
            td.classList.add("suite-num-improvements");
            tr.append(td);
          }
          tr.append(document.createElement("td"));
        }

        {
          const tr = document.createElement("tr");
          tfoot.append(tr);

          const th = document.createElement("th");
          th.append("Regression");
          tr.append(th);

          for (const test of testNames) {
            const td = document.createElement("td");
            td.classList.add("num");
            td.append(per_test_results[test].numHighRegressions);
            tr.append(td);

            if (per_test_results[test].numHighImprovements < per_test_results[test].numHighRegressions) {
              td.style.backgroundColor = "var(--regression-background)";
            }
          }

          {
            const td = document.createElement("td");
            td.classList.add("suite-num-improvements");
            tr.append(td);
          }
          tr.append(document.createElement("td"));
        }
      }

      main.append(table);
    }
  }
}

add_scores();
draw_scores();
