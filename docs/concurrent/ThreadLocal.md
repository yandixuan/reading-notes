# ThreadLocal

[文章参考](https://www.cnblogs.com/micrari/p/6790229.html)

[文章参考](https://blog.csdn.net/y4x5M0nivSrJaY3X92c/article/details/81124944)

多线程访问同一个共享变量的时候容易出现并发问题，特别是多个线程对一个变量进行写入的时候，为了保证线程安全，
一般使用者在访问共享变量的时候需要进行额外的同步措施才能保证线程安全性。
ThreadLocal 是除了加锁这种同步方式之外的一种保证一种规避多线程访问出现线程不安全的方法，
当我们在创建一个变量后，如果每个线程对其进行访问的时候访问的都是线程自己的变量这样就不会存在线程不安全问题。

```java
    public class ThreadLocal<T> {
    ...省略
    }
```

## 属性

## 构造函数

## 内部类

ThreadLocal 类用来设置线程私有变量 本身不储存值 主要提供自身引用 和 操作 ThreadLocalMap 属性值得方法，
使用 ThreadLocal 会通过 ThreadLocal 的引用定位到到堆中 Thread 的类 ThreadLocalMap 里散列表里的值 从而达到线程私有
目的：解决多线程使用共享对象的问题 空间换时间

:::tip 提示
开放地址法缺点 ： 空间利用率低 开发地址发会在散列冲突时寻找下一个可存入的槽点 为了避免冲突 负载因子会设置的相对较小
:::

### ThreadLocalMap

ThreadLocalMap 是一个定制的哈希映射，仅适用于维护线程本地值。ThreadLocalMap 类是包私有的，允许在 Thread 类中声明字段。
为了帮助处理非常大且长时间的使用，哈希表 entry 使用了对键的弱引用。有助于 GC 回收。

但是，JDK 后面优化了设计方案，现时 JDK8 ThreadLocal 的设计是：每个 Thread 维护一个 ThreadLocalMap 哈希表，这个哈希表的 key 是 ThreadLocal 实例本身，value 才是真正要存储的值 Object。

```java
    static class ThreadLocalMap {

        /**
         * The entries in this hash map extend WeakReference, using
         * its main ref field as the key (which is always a
         * ThreadLocal object).  Note that null keys (i.e. entry.get()
         * == null) mean that the key is no longer referenced, so the
         * entry can be expunged from table.  Such entries are referred to
         * as "stale entries" in the code that follows.
         */

        /**
        * 在ThreadLocalMap中，也是用Entry来保存K-V结构数据的。但是Entry中key只能是ThreadLocal对象，这点被Entry的构造方法已经限定死了
        *
        *  Entry继承WeakReference,使用弱引用，可以将ThreadLocal对象的生命周期和线程生命周期解绑，持有对ThreadLocal的弱引用，可以使得ThreadLocal在没有其他强引用的时候被回收掉，
        *  这样可以避免因为线程得不到销毁导致ThreadLocal对象无法被回收
        *
        */
        static class Entry extends WeakReference<ThreadLocal<?>> {
            /** The value associated with this ThreadLocal. */
            Object value;

            Entry(ThreadLocal<?> k, Object v) {
                super(k);
                value = v;
            }
        }

        /**
         * The initial capacity -- MUST be a power of two.
         */
         // 初始容量 16
        private static final int INITIAL_CAPACITY = 16;

        /**
         * The table, resized as necessary.
         * table.length MUST always be a power of two.
         */
         // 散列表
        private Entry[] table;

        /**
         * The number of entries in the table.
         */
         // entry 有效数量
        private int size = 0;

        /**
         * The next size value at which to resize.
         */
         // 负载因子
        private int threshold; // Default to 0

        /**
         * Set the resize threshold to maintain at worst a 2/3 load factor.
         */
        // 负载因子为长度的2/3
        private void setThreshold(int len) {
            threshold = len * 2 / 3;
        }

        /**
         * Increment i modulo len.
         */
        private static int nextIndex(int i, int len) {
            return ((i + 1 < len) ? i + 1 : 0);
        }

        /**
         * Decrement i modulo len.
         */
        private static int prevIndex(int i, int len) {
            return ((i - 1 >= 0) ? i - 1 : len - 1);
        }

        /**
         * 构造函数
         * Construct a new map initially containing (firstKey, firstValue).
         * ThreadLocalMaps are constructed lazily, so we only create
         * one when we have at least one entry to put in it.
         */
        ThreadLocalMap(ThreadLocal<?> firstKey, Object firstValue) {
            // 初始化数组 容量 16
            table = new Entry[INITIAL_CAPACITY];
            // 第一个key 根据hash散列出的数组下标
            int i = firstKey.threadLocalHashCode & (INITIAL_CAPACITY - 1);
            // 将entry塞入数组
            table[i] = new Entry(firstKey, firstValue);
            // size为1
            size = 1;
            // 设置扩容阈值
            setThreshold(INITIAL_CAPACITY);
        }

        /**
         * Construct a new map including all Inheritable ThreadLocals
         * from given parent map. Called only by createInheritedMap.
         *
         * @param parentMap the map associated with parent thread.
         */
        private ThreadLocalMap(ThreadLocalMap parentMap) {
            Entry[] parentTable = parentMap.table;
            int len = parentTable.length;
            setThreshold(len);
            table = new Entry[len];

            for (int j = 0; j < len; j++) {
                Entry e = parentTable[j];
                if (e != null) {
                    @SuppressWarnings("unchecked")
                    ThreadLocal<Object> key = (ThreadLocal<Object>) e.get();
                    if (key != null) {
                        Object value = key.childValue(e.value);
                        Entry c = new Entry(key, value);
                        int h = key.threadLocalHashCode & (len - 1);
                        while (table[h] != null)
                            h = nextIndex(h, len);
                        table[h] = c;
                        size++;
                    }
                }
            }
        }

        /**
         * Get the entry associated with key.  This method
         * itself handles only the fast path: a direct hit of existing
         * key. It otherwise relays to getEntryAfterMiss.  This is
         * designed to maximize performance for direct hits, in part
         * by making this method readily inlinable.
         *
         * @param  key the thread local object
         * @return the entry associated with key, or null if no such
         */
        private Entry getEntry(ThreadLocal<?> key) {
            // 根据key这个ThreadLocal的ID来获取索引，也即哈希值
            int i = key.threadLocalHashCode & (table.length - 1);
            Entry e = table[i];
            // 对应的entry存在且未失效且弱引用指向的ThreadLocal就是key，则命中返回
            if (e != null && e.get() == key)
                return e;
            else
                // 因为用的是线性探测，所以往后找还是有可能能够找到目标Entry的。
                return getEntryAfterMiss(key, i, e);
        }

        /**
         * Version of getEntry method for use when key is not found in
         * its direct hash slot.
         *
         * @param  key the thread local object
         * @param  i the table index for key's hash code
         * @param  e the entry at table[i]
         * @return the entry associated with key, or null if no such
         */
        private Entry getEntryAfterMiss(ThreadLocal<?> key, int i, Entry e) {
            Entry[] tab = table;
            int len = tab.length;
             // 基于线性探测法不断向后探测直到遇到空entry。
            while (e != null) {
                ThreadLocal<?> k = e.get();
                // 找到目标
                if (k == key)
                    return e;
                if (k == null)
                    // 该entry对应的ThreadLocal已经被回收，调用expungeStaleEntry来清理一段连续无效的entry
                    expungeStaleEntry(i);
                else
                    // 环形意义下往后面走
                    i = nextIndex(i, len);
                e = tab[i];
            }
            return null;
        }

        /**
         * Set the value associated with key.
         *
         * @param key the thread local object
         * @param value the value to be set
         */
        private void set(ThreadLocal<?> key, Object value) {

            // We don't use a fast path as with get() because it is at
            // least as common to use set() to create new entries as
            // it is to replace existing ones, in which case, a fast
            // path would fail more often than not.

            Entry[] tab = table;
            int len = tab.length;
            // 根据哈希码和数组长度求元素放置的位置，即数组下标
            int i = key.threadLocalHashCode & (len-1);
            // 循环tab 数组，如果 e 不为空说明hash冲突了，不断向后寻找 （开放寻址法）
            for (Entry e = tab[i];
                 e != null;
                 e = tab[i = nextIndex(i, len)]) {
                 // 先进入循环内部，获取threadLocal
                ThreadLocal<?> k = e.get();
                // 如果 k与key是同一个对象，直接覆盖值结束
                if (k == key) {
                    e.value = value;
                    return;
                }
                // 替换失效的entry
                if (k == null) {
                    replaceStaleEntry(key, value, i);
                    return;
                }
            }
            //
            tab[i] = new Entry(key, value);
            int sz = ++size;
            if (!cleanSomeSlots(i, sz) && sz >= threshold)
                rehash();
        }

        /**
         * Remove the entry for key.
         */
        private void remove(ThreadLocal<?> key) {
            Entry[] tab = table;
            int len = tab.length;
            int i = key.threadLocalHashCode & (len-1);
            for (Entry e = tab[i];
                 e != null;
                 e = tab[i = nextIndex(i, len)]) {
                if (e.get() == key) {
                    e.clear();
                    expungeStaleEntry(i);
                    return;
                }
            }
        }

        /**
         * 替换 ThreadLocal 为null的 entry节点
         * Replace a stale entry encountered during a set operation
         * with an entry for the specified key.  The value passed in
         * the value parameter is stored in the entry, whether or not
         * an entry already exists for the specified key.
         *
         * As a side effect, this method expunges all stale entries in the
         * "run" containing the stale entry.  (A run is a sequence of entries
         * between two null slots.)
         *
         * @param  key the key
         * @param  value the value to be associated with key
         * @param  staleSlot index of the first stale entry encountered while
         *         searching for key.
         */
        private void replaceStaleEntry(ThreadLocal<?> key, Object value,
                                       int staleSlot) {
            // staleSlot key为null的数组下标
            Entry[] tab = table;
            int len = tab.length;
            Entry e;

            // Back up to check for prior stale entry in current run.
            // We clean out whole runs at a time to avoid continual
            // incremental rehashing due to garbage collector freeing
            // up refs in bunches (i.e., whenever the collector runs).
            int slotToExpunge = staleSlot;
            // 向前扫描，查找最近的一个无效slot，位置标记为 slotToExpunge，如果扫描到空位置就停止循环
            for (int i = prevIndex(staleSlot, len);
                 (e = tab[i]) != null;
                 i = prevIndex(i, len))
                if (e.get() == null)
                    slotToExpunge = i;

            // Find either the key or trailing null slot of run, whichever
            // occurs first
            // 从 staleSlot 向后遍历 table 扫描到空位置就停止循环
            for (int i = nextIndex(staleSlot, len);
                 (e = tab[i]) != null;
                 i = nextIndex(i, len)) {
                ThreadLocal<?> k = e.get();

                // If we find key, then we need to swap it
                // with the stale entry to maintain hash table order.
                // The newly stale slot, or any other stale slot
                // encountered above it, can then be sent to expungeStaleEntry
                // to remove or rehash all of the other entries in run.
                // 找到了key，将其与无效的slot交换
                if (k == key) {
                    e.value = value;
                    // 那么tab[i]指向null
                    tab[i] = tab[staleSlot];
                    // 无效slot位置放置 找到key对应的entry
                    tab[staleSlot] = e;

                    // Start expunge at preceding stale entry if it exists
                    // 这里说明 向前探测并没有找到过期数据
                    // 只有staleSlot 这个过期，由于前面过期的对象已经通过交换位置的方式放到index=i上了，
                    // 所以需要清理的位置是i,而不是传过来的staleSlot
                    if (slotToExpunge == staleSlot)
                        slotToExpunge = i;
                    // 从slotToExpunge开始做一次连续段的清理，再做一次启发式清理
                    cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
                    return;
                }

                // If we didn't find stale entry on backward scan, the
                // first stale entry seen while scanning for key is the
                // first still present in the run.
                // 如果当前的slot已经无效，并且向前扫描过程中没有无效slot，则更新slotToExpunge为当前位置
                if (k == null && slotToExpunge == staleSlot)
                    slotToExpunge = i;
            }
            // 如果key在table中不存在，则在原地放一个即可
            // If key not found, put new entry in stale slot
            tab[staleSlot].value = null;
            tab[staleSlot] = new Entry(key, value);
            // 在探测过程中如果发现任何无效slot，则做一次清理（连续段清理+启发式清理）
            // If there are any other stale entries in run, expunge them
            if (slotToExpunge != staleSlot)
                cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
        }

        /**
         * Expunge a stale entry by rehashing any possibly colliding entries
         * lying between staleSlot and the next null slot.  This also expunges
         * any other stale entries encountered before the trailing null.  See
         * Knuth, Section 6.4
         *
         * @param staleSlot index of slot known to have null key
         * @return the index of the next null slot after staleSlot
         * (all between staleSlot and this slot will have been checked
         * for expunging).
         */
        private int expungeStaleEntry(int staleSlot) {
            Entry[] tab = table;
            int len = tab.length;
            // 在 index = staleSlot 位置上清除过期元素
            // expunge entry at staleSlot
            // 因为entry对应的ThreadLocal已经被回收，value设为null，显式断开强引用
            tab[staleSlot].value = null;
            // 显式设置该entry为null，以便垃圾回收
            tab[staleSlot] = null;
            size--;

            // Rehash until we encounter null
            Entry e;
            int i;
            // 继续向后遍历，直到元素为 null则停止循环
            for (i = nextIndex(staleSlot, len);
                 (e = tab[i]) != null;
                 i = nextIndex(i, len)) {
                ThreadLocal<?> k = e.get();
                if (k == null) {
                    // 清理对应ThreadLocal已经被回收的entry，将强引用的value进行回收
                    e.value = null;
                    tab[i] = null;
                    size--;
                } else {
                    /*
                     * 对于还没有被回收的情况，需要做一次rehash。
                     *
                     * 如果对应的ThreadLocal的ID对len取模出来的索引h不为当前位置i，
                     * 则从h向后线性探测到第一个空的slot，把当前的entry给挪过去。
                     */
                    int h = k.threadLocalHashCode & (len - 1);
                    if (h != i) {
                        tab[i] = null;

                        // Unlike Knuth 6.4 Algorithm R, we must scan until
                        // null because multiple entries could have been stale.
                        // 这里 还真没弄懂 大致意思防止 具有相同哈希值的entry之间断开（中间有空entry）
                        // 相同hash值的key不能断开 这应该是重点
                        while (tab[h] != null)
                            h = nextIndex(h, len);
                        tab[h] = e;
                    }
                }
            }
            // 返回staleSlot之后第一个空的slot索引
            return i;
        }

        /**
         * Heuristically scan some cells looking for stale entries.
         * This is invoked when either a new element is added, or
         * another stale one has been expunged. It performs a
         * logarithmic number of scans, as a balance between no
         * scanning (fast but retains garbage) and a number of scans
         * proportional to number of elements, that would find all
         * garbage but would cause some insertions to take O(n) time.
         *
         * @param i a position known NOT to hold a stale entry. The
         * scan starts at the element after i.
         *
         * @param n scan control: {@code log2(n)} cells are scanned,
         * unless a stale entry is found, in which case
         * {@code log2(table.length)-1} additional cells are scanned.
         * When called from insertions, this parameter is the number
         * of elements, but when from replaceStaleEntry, it is the
         * table length. (Note: all this could be changed to be either
         * more or less aggressive by weighting n instead of just
         * using straight log n. But this version is simple, fast, and
         * seems to work well.)
         *
         * @return true if any stale entries have been removed.
         */
        private boolean cleanSomeSlots(int i, int n) {
            // i对应entry是非无效（指向的ThreadLocal没被回收，或者entry本身为空）
            // n是用于控制控制扫描次数的
            boolean removed = false;
            Entry[] tab = table;
            int len = tab.length;
            do {
                // 所以直接从下一个开始
                i = nextIndex(i, len);
                Entry e = tab[i];
                // 发现key失效了
                if (e != null && e.get() == null) {
                    // 扩大次数
                    n = len;
                    // 修改清理标志
                    removed = true;
                    // 清理一个连续段
                    // 清理之后返回的i又是一个null Entry
                    i = expungeStaleEntry(i);
                }
                // n除以2
            } while ( (n >>>= 1) != 0);
            return removed;
        }

        /**
         * Re-pack and/or re-size the table. First scan the entire
         * table removing stale entries. If this doesn't sufficiently
         * shrink the size of the table, double the table size.
         */
        private void rehash() {
            // 做一次全量清理
            expungeStaleEntries();

           /*
            * 因为做了一次清理，所以size很可能会变小。
            * ThreadLocalMap这里的实现是调低阈值来判断是否需要扩容，
            * threshold默认为len*2/3，所以这里的threshold - threshold / 4相当于len/2
            */
            // Use lower threshold for doubling to avoid hysteresis
            if (size >= threshold - threshold / 4)
                resize();
        }

        /**
         * 扩容，因为需要保证table的容量len为2的幂，所以扩容即扩大2倍
         * Double the capacity of the table.
         */
        private void resize() {
            Entry[] oldTab = table;
            int oldLen = oldTab.length;
            int newLen = oldLen * 2;
            Entry[] newTab = new Entry[newLen];
            int count = 0;

            for (int j = 0; j < oldLen; ++j) {
                Entry e = oldTab[j];
                if (e != null) {
                    ThreadLocal<?> k = e.get();
                    if (k == null) {
                        e.value = null; // Help the GC
                    } else {
                        // 线性探测来存放Entry
                        int h = k.threadLocalHashCode & (newLen - 1);
                        while (newTab[h] != null)
                            h = nextIndex(h, newLen);
                        newTab[h] = e;
                        count++;
                    }
                }
            }
            // 设置新阈值、Entry容量，table
            setThreshold(newLen);
            size = count;
            table = newTab;
        }

        /**
         * Expunge all stale entries in the table.
         */
        private void expungeStaleEntries() {
            Entry[] tab = table;
            int len = tab.length;
            for (int j = 0; j < len; j++) {
                Entry e = tab[j];
                if (e != null && e.get() == null)
                    // 又是把i所在连续段内所有无效slot都清理了一遍了
                    expungeStaleEntry(j);
            }
        }
    }
```

## 方法

### set

threadLocal 设置值

```java

    public void set(T value) {
        // 获取当前线程
        Thread t = Thread.currentThread();
        // 获取线程的 threadLocals 线程副本值
        ThreadLocalMap map = getMap(t);

        if (map != null)
            // ThreadLocalMap不为空那么直接塞值
            map.set(this, value);
        else
            // 否则进行初始化，调用createMap 从这里我们可以看出 ThreadLocalMap是延时初始化
            createMap(t, value);
    }

```

### getMap

```java
    // getMap 实际读取的是 线程的 threadLocals 变量 即 ThreadLocal.ThreadLocalMap
    ThreadLocalMap getMap(Thread t) {
        return t.threadLocals;
    }
```

### createMap

```java

    void createMap(Thread t, T firstValue) {
        // 调用构造函数进行初始化
        t.threadLocals = new ThreadLocalMap(this, firstValue);
    }
```

### get

```java

    public T get() {
        // 获取当前线程
        Thread t = Thread.currentThread();
        // 获取线程的 threadLocals 线程副本值
        ThreadLocalMap map = getMap(t);
        if (map != null) {
            // 线程副本不为空
            ThreadLocalMap.Entry e = map.getEntry(this);
            if (e != null) {
                @SuppressWarnings("unchecked")
                T result = (T)e.value;
                return result;
            }
        }
        return setInitialValue();
    }
```
